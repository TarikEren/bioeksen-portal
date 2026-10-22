#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/50c3e51e688ccd632a36f42612ab7efd04b595f604a949e8ecdc1fa3b0f85da5/contract';
import startContract from '../../snapshots/50c3e51e688ccd632a36f42612ab7efd04b595f604a949e8ecdc1fa3b0f85da5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/611d61f0e7bd6becd3659f2734221f3eb0e11f628c9a533e5a893de8dcfde676/contract';
import endContract from '../../snapshots/611d61f0e7bd6becd3659f2734221f3eb0e11f628c9a533e5a893de8dcfde676/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
  rawSql,
  sql,
} from '@prisma/orm-postgres/migration';

// DEC-005: the objects that the contract cannot hold are raw operations of the
// migration that creates their tables. The drift check cannot see them: an
// integration test proves that each one exists.
interface Existence {
  readonly exists: string;
}

function rawObject(id: string, label: string, statement: string, check: Existence) {
  return rawSql({
    id,
    label: `Create ${label}`,
    operationClass: 'additive',
    target: { id: 'postgres' },
    precheck: [{ description: `ensure ${label} is not there`, sql: `SELECT NOT (${check.exists}) AS "result"`, params: [] }],
    execute: [{ description: `create ${label}`, sql: statement, params: [] }],
    postcheck: [{ description: `verify ${label} exists`, sql: `SELECT (${check.exists}) AS "result"`, params: [] }],
  });
}

const triggerExists = (table: string, name: string): Existence => ({
  exists: `EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${name}' AND tgrelid = to_regclass('public.${table}'))`,
});
const functionExists = (name: string): Existence => ({ exists: `to_regprocedure('public.${name}()') IS NOT NULL` });

// DEC-010: the triggers that refuse the removal of a controlled record.
// `platform_refuse_delete()` is the function of the migration
// `platform_log_record_constraints` (FND-06 rule 5).
type RefusedEvent = 'DELETE' | 'TRUNCATE';

function refuseTrigger(table: string, event: RefusedEvent) {
  const name = `${table}_refuse_${event.toLowerCase()}`;
  const scope = event === 'TRUNCATE' ? 'STATEMENT' : 'ROW';
  return rawObject(
    `trigger.${name}`,
    `trigger "${name}"`,
    `CREATE TRIGGER "${name}" BEFORE ${event} ON "public"."${table}" FOR EACH ${scope} EXECUTE FUNCTION "public"."platform_refuse_delete"()`,
    triggerExists(table, name),
  );
}

/**
 * A trigger function that refuses with `RAISE ... USING ERRCODE, CONSTRAINT`.
 * The name of the rule is the constraint of the error, so a service can tell the
 * rule from the text of the driver.
 */
function ruleFunction(name: string, body: string) {
  return rawObject(
    `function.${name}`,
    `function "${name}"`,
    `CREATE FUNCTION "public"."${name}"() RETURNS trigger LANGUAGE plpgsql AS $function$\n${body}\n$function$`,
    functionExists(name),
  );
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'eifu_applicability',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('document_version_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('product_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('withdrawn_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'applicability_period_is_ordered',
            sql`((effective_to IS NULL) OR (effective_to > effective_from))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'eifu_document',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('document_number', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('document_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('product_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('title', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('eifu_document_number_length', sql`(char_length(document_number) <= 64)`),
          checkExpression(
            'eifu_document_title_has_both_languages',
            sql`((jsonb_typeof(title) = 'object'::text) AND (jsonb_typeof((title -> 'tr'::text)) = 'string'::text) AND (jsonb_typeof((title -> 'en'::text)) = 'string'::text))`,
          ),
          checkExpression('eifu_document_type_is_known', sql`(document_type = 'IFU'::text)`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'eifu_document_file',
        columns: [
          col('content_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('document_version_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('file_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('file_size_bytes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('language_code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('original_filename', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('storage_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('eifu_document_file_has_bytes', sql`(file_size_bytes > 0)`),
          checkExpression(
            'eifu_document_file_hash_is_sha256',
            sql`(file_hash ~ '^[0-9a-f]{64}$'::text)`,
          ),
          checkExpression(
            'eifu_document_file_language_code_length',
            sql`(char_length(language_code) <= 35)`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'eifu_document_version',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('document_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('proposed_effective_from', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('published_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('published_by_user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('revision', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('superseded_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('withdrawal_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('withdrawn_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('withdrawn_by_user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'eifu_document_version_published_after_draft',
            sql`((status = 'DRAFT'::text) OR (published_at IS NOT NULL))`,
          ),
          checkExpression(
            'eifu_document_version_revision_length',
            sql`(char_length(revision) <= 16)`,
          ),
          checkExpression(
            'eifu_document_version_status_is_known',
            sql`(status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'SUPERSEDED'::text, 'WITHDRAWN'::text]))`,
          ),
          checkExpression(
            'eifu_document_version_withdrawal_is_complete',
            sql`((status <> 'WITHDRAWN'::text) OR ((withdrawn_at IS NOT NULL) AND (withdrawal_reason IS NOT NULL) AND (btrim(withdrawal_reason) <> ''::text)))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'eifu_file_replacement',
        columns: [
          col('document_version_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('language_code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('previous_file_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('previous_file_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('replaced_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('replaced_by_user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('replacement_file_hash', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('replacement_file_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'eifu_file_replacement_hashes_differ',
            sql`(previous_file_hash <> replacement_file_hash)`,
          ),
          checkExpression('file_replacement_reason_is_present', sql`(btrim(reason) <> ''::text)`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'eifu_lot_override',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('created_by_user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('document_version_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('end_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('ended_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('ended_by_user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('lot_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'eifu_lot_override_end_is_complete',
            sql`(is_active OR ((ended_at IS NOT NULL) AND (end_reason IS NOT NULL) AND (btrim(end_reason) <> ''::text)))`,
          ),
          checkExpression('lot_override_reason_is_present', sql`(btrim(reason) <> ''::text)`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'eifu_applicability',
        constraint: 'applicability_one_period_per_version',
        columns: ['document_version_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'eifu_document',
        constraint: 'document_number_unique',
        columns: ['document_number'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'eifu_document_version',
        constraint: 'document_version_unique_revision',
        columns: ['document_id', 'revision'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_applicability',
        index: 'applicability_lookup_idx',
        columns: ['product_id', 'effective_from'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_applicability',
        index: 'eifu_applicability_product_id_idx_22a2b7d2',
        columns: ['product_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_document',
        index: 'eifu_document_product_idx',
        columns: ['product_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_document_file',
        index: 'document_file_one_active_per_language',
        columns: ['document_version_id', 'language_code'],
        extras: { where: sql`is_active`, unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_document_file',
        index: 'eifu_document_file_version_idx',
        columns: ['document_version_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_document_version',
        index: 'eifu_document_version_document_idx',
        columns: ['document_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_file_replacement',
        index: 'eifu_file_replacement_previous_file_id_idx_a9524924',
        columns: ['previous_file_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_file_replacement',
        index: 'eifu_file_replacement_replacement_file_id_idx_a5235946',
        columns: ['replacement_file_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_file_replacement',
        index: 'eifu_file_replacement_version_idx',
        columns: ['document_version_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_lot_override',
        index: 'eifu_lot_override_lot_idx',
        columns: ['lot_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_lot_override',
        index: 'eifu_lot_override_version_idx',
        columns: ['document_version_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_lot_override',
        index: 'lot_override_one_active_per_lot',
        columns: ['lot_id'],
        extras: { where: sql`is_active`, unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_applicability',
        foreignKey: {
          name: 'eifu_applicability_version_fk',
          columns: ['document_version_id'],
          references: { schema: 'public', table: 'eifu_document_version', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_applicability',
        foreignKey: {
          name: 'eifu_applicability_product_fk',
          columns: ['product_id'],
          references: { schema: 'public', table: 'catalog_product', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_document',
        foreignKey: {
          name: 'eifu_document_product_fk',
          columns: ['product_id'],
          references: { schema: 'public', table: 'catalog_product', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_document_file',
        foreignKey: {
          name: 'eifu_document_file_version_fk',
          columns: ['document_version_id'],
          references: { schema: 'public', table: 'eifu_document_version', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_document_version',
        foreignKey: {
          name: 'eifu_document_version_document_fk',
          columns: ['document_id'],
          references: { schema: 'public', table: 'eifu_document', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_file_replacement',
        foreignKey: {
          name: 'eifu_file_replacement_version_fk',
          columns: ['document_version_id'],
          references: { schema: 'public', table: 'eifu_document_version', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_file_replacement',
        foreignKey: {
          name: 'eifu_file_replacement_previous_fk',
          columns: ['previous_file_id'],
          references: { schema: 'public', table: 'eifu_document_file', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_file_replacement',
        foreignKey: {
          name: 'eifu_file_replacement_next_fk',
          columns: ['replacement_file_id'],
          references: { schema: 'public', table: 'eifu_document_file', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_lot_override',
        foreignKey: {
          name: 'eifu_lot_override_lot_fk',
          columns: ['lot_id'],
          references: { schema: 'public', table: 'catalog_lot', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'eifu_lot_override',
        foreignKey: {
          name: 'eifu_lot_override_version_fk',
          columns: ['document_version_id'],
          references: { schema: 'public', table: 'eifu_document_version', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      // IFU-30 rule 5: the exclusion constraint needs `btree_gist` for `product_id WITH =`.
      rawObject('extension.btree_gist', 'extension "btree_gist"', 'CREATE EXTENSION IF NOT EXISTS "btree_gist"', {
        exists: `EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist')`,
      }),
      // IFU-30 rule 5, IFU-30.AC7: two live periods of one product never overlap.
      // A period is half-open (DEC-061). A withdrawn period leaves the check.
      rawObject(
        'constraint.applicability_no_overlap_per_product',
        'constraint "applicability_no_overlap_per_product"',
        `ALTER TABLE "public"."eifu_applicability" ADD CONSTRAINT "applicability_no_overlap_per_product" EXCLUDE USING gist ("product_id" WITH =, daterange("effective_from", "effective_to", '[)') WITH &&) WHERE ("withdrawn_at" IS NULL)`,
        {
          exists: `EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicability_no_overlap_per_product' AND conrelid = to_regclass('public.eifu_applicability'))`,
        },
      ),
      // IFU-10 rule 2: the product of a document changes only before the first publication.
      ruleFunction(
        'eifu_document_product_is_settled',
        `BEGIN
  IF EXISTS (SELECT 1 FROM "public"."eifu_document_version" WHERE "document_id" = OLD."id" AND "status" <> 'DRAFT') THEN
    RAISE EXCEPTION 'the product of the document % does not change after a publication', OLD."id"
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'document_product_is_settled';
  END IF;
  RETURN NEW;
END;`,
      ),
      rawObject(
        'trigger.document_product_is_settled',
        'trigger "document_product_is_settled"',
        `CREATE TRIGGER "document_product_is_settled" BEFORE UPDATE OF "product_id" ON "public"."eifu_document" FOR EACH ROW WHEN (OLD."product_id" IS DISTINCT FROM NEW."product_id") EXECUTE FUNCTION "public"."eifu_document_product_is_settled"()`,
        triggerExists('eifu_document', 'document_product_is_settled'),
      ),
      // IFU-30 rule 5: a period names the product of its document.
      ruleFunction(
        'eifu_applicability_on_document_product',
        `BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "public"."eifu_document_version" v
    JOIN "public"."eifu_document" d ON d."id" = v."document_id"
    WHERE v."id" = NEW."document_version_id" AND d."product_id" = NEW."product_id"
  ) THEN
    RAISE EXCEPTION 'the product of a period is not the product of its document'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'applicability_on_document_product';
  END IF;
  RETURN NEW;
END;`,
      ),
      rawObject(
        'trigger.applicability_on_document_product',
        'trigger "applicability_on_document_product"',
        `CREATE TRIGGER "applicability_on_document_product" BEFORE INSERT OR UPDATE OF "document_version_id", "product_id" ON "public"."eifu_applicability" FOR EACH ROW EXECUTE FUNCTION "public"."eifu_applicability_on_document_product"()`,
        triggerExists('eifu_applicability', 'applicability_on_document_product'),
      ),
      // IFU-10 rule 5, CAT-10.AC4, DEC-096: the stem and the regulatory status of
      // a product change only while no document names it. The trigger is on a
      // table of the catalog, and this migration creates it, so the catalog
      // module never imports the eifu module (DEC-004).
      ruleFunction(
        'eifu_product_identity_is_settled',
        `BEGIN
  IF EXISTS (SELECT 1 FROM "public"."eifu_document" WHERE "product_id" = OLD."id") THEN
    RAISE EXCEPTION 'the stem and the regulatory status of the product % do not change while a document names it', OLD."id"
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'product_identity_is_settled';
  END IF;
  RETURN NEW;
END;`,
      ),
      rawObject(
        'trigger.product_identity_is_settled',
        'trigger "product_identity_is_settled"',
        `CREATE TRIGGER "product_identity_is_settled" BEFORE UPDATE OF "internal_code", "regulatory_status" ON "public"."catalog_product" FOR EACH ROW WHEN (OLD."internal_code" IS DISTINCT FROM NEW."internal_code" OR OLD."regulatory_status" IS DISTINCT FROM NEW."regulatory_status") EXECUTE FUNCTION "public"."eifu_product_identity_is_settled"()`,
        triggerExists('catalog_product', 'product_identity_is_settled'),
      ),
      ...(
        [
          'eifu_document',
          'eifu_document_version',
          'eifu_document_file',
          'eifu_applicability',
          'eifu_file_replacement',
          'eifu_lot_override',
        ] as const
      ).flatMap((table) => [refuseTrigger(table, 'DELETE'), refuseTrigger(table, 'TRUNCATE')]),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
