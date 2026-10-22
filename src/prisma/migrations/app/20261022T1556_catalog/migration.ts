#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/50c3e51e688ccd632a36f42612ab7efd04b595f604a949e8ecdc1fa3b0f85da5/contract';
import endContract from '../../snapshots/50c3e51e688ccd632a36f42612ab7efd04b595f604a949e8ecdc1fa3b0f85da5/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/eca4a59f5254f24a70d12d673bf8ae09b29ae0e6e05b9a0f87d1f7ee578e5675/contract';
import startContract from '../../snapshots/eca4a59f5254f24a70d12d673bf8ae09b29ae0e6e05b9a0f87d1f7ee578e5675/contract.json' with { type: 'json' };
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

// DEC-010: the triggers that refuse the removal of a controlled record.
// `platform_refuse_delete()` is the function of the migration
// `platform_log_record_constraints` (FND-06 rule 5). A trigger is not part of the
// contract, so each one is a raw operation of the migration that creates its
// table (DEC-005). The drift check cannot see them: an integration test proves
// that each one exists.
type RefusedEvent = 'DELETE' | 'TRUNCATE';

function refuseTrigger(table: string, event: RefusedEvent) {
  const name = `${table}_refuse_${event.toLowerCase()}`;
  const scope = event === 'TRUNCATE' ? 'STATEMENT' : 'ROW';
  return rawSql({
    id: `trigger.${name}`,
    label: `Create trigger "${name}"`,
    operationClass: 'additive',
    target: { id: 'postgres' },
    precheck: [
      {
        description: `ensure trigger "${name}" does not exist`,
        sql: `SELECT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${name}' AND tgrelid = to_regclass('public.${table}')) AS "result"`,
        params: [],
      },
    ],
    execute: [
      {
        description: `create trigger "${name}"`,
        sql: `CREATE TRIGGER "${name}" BEFORE ${event} ON "public"."${table}" FOR EACH ${scope} EXECUTE FUNCTION "public"."platform_refuse_delete"()`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: `verify trigger "${name}" exists`,
        sql: `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${name}' AND tgrelid = to_regclass('public.${table}')) AS "result"`,
        params: [],
      },
    ],
  });
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'catalog_catalog_number',
        columns: [
          col('catalog_number', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('format', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('pack_size', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('product_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'catalog_catalog_number_format_is_known',
            sql`((format IS NULL) OR (format = ANY (ARRAY['VCAP'::text, 'LYOPHILIZED'::text, 'LIQUID'::text])))`,
          ),
          checkExpression(
            'catalog_catalog_number_length',
            sql`(char_length(catalog_number) <= 64)`,
          ),
          checkExpression(
            'catalog_catalog_number_pack_size_length',
            sql`((pack_size IS NULL) OR (char_length(pack_size) <= 32))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'catalog_lot',
        columns: [
          col('catalog_number_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('expiry_date', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('has_date_conflict', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('lot_import_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('lot_number', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('manufacturing_date', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('manufacturing_date_source', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('supplied_manufacturing_date', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('catalog_lot_lot_number_length', sql`(char_length(lot_number) <= 64)`),
          checkExpression(
            'catalog_lot_manufacturing_date_source_is_known',
            sql`(manufacturing_date_source = ANY (ARRAY['PARSED_FROM_LOT'::text, 'SUPPLIED'::text, 'MANUAL_CORRECTION'::text]))`,
          ),
          checkExpression(
            'lot_expiry_after_manufacturing',
            sql`((expiry_date IS NULL) OR (expiry_date > manufacturing_date))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'catalog_lot_import',
        columns: [
          col('completed_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('conflict_count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('created_count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('existing_count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('failure_code', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('invalid_count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('product_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('row_count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('source_filename', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('source_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('uploaded_by_user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'catalog_lot_import_counts_not_negative',
            sql`((row_count >= 0) AND (created_count >= 0) AND (existing_count >= 0) AND (conflict_count >= 0) AND (invalid_count >= 0))`,
          ),
          checkExpression(
            'catalog_lot_import_failure_code_only_when_failed',
            sql`((failure_code IS NULL) OR (status = 'FAILED'::text))`,
          ),
          checkExpression(
            'catalog_lot_import_status_is_known',
            sql`(status = ANY (ARRAY['PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text]))`,
          ),
          checkExpression(
            'lot_import_counts_add_up',
            sql`((status <> 'COMPLETED'::text) OR ((((created_count + existing_count) + conflict_count) + invalid_count) = row_count))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'catalog_lot_import_row',
        columns: [
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('lot_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('lot_import_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('outcome', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('raw_cells', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('row_number', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('catalog_lot_import_row_number_from_one', sql`(row_number >= 1)`),
          checkExpression(
            'catalog_lot_import_row_outcome_is_known',
            sql`(outcome = ANY (ARRAY['CREATED'::text, 'ALREADY_EXISTS'::text, 'CONFLICT_REVIEW_REQUIRED'::text, 'INVALID_CATALOG_NUMBER'::text, 'INVALID_LOT_FORMAT'::text, 'INVALID_DATE'::text]))`,
          ),
          checkExpression(
            'catalog_lot_import_row_reason_is_known',
            sql`((reason IS NULL) OR (reason = ANY (ARRAY['LOT_ALREADY_EXISTS'::text, 'DUPLICATE_ROW'::text, 'DATE_DIFFERS_FROM_REGISTERED'::text, 'SUPPLIED_DATE_CONFLICT'::text, 'KIT_CODE_MISMATCH'::text, 'CONFLICTING_ROWS'::text, 'CATALOG_NUMBER_NOT_FOUND'::text, 'OTHER_PRODUCT'::text, 'LOT_MISSING'::text, 'LOT_FORMAT_INVALID'::text, 'LOT_DATE_INVALID'::text, 'SUPPLIED_DATE_INVALID'::text])))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'catalog_product',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('description', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('internal_code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('kit_code_base', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('regulatory_status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'catalog_product_description_has_both_languages',
            sql`((description IS NULL) OR ((jsonb_typeof(description) = 'object'::text) AND (jsonb_typeof((description -> 'tr'::text)) = 'string'::text) AND (jsonb_typeof((description -> 'en'::text)) = 'string'::text)))`,
          ),
          checkExpression(
            'catalog_product_internal_code_length',
            sql`(char_length(internal_code) <= 64)`,
          ),
          checkExpression(
            'catalog_product_kit_code_base_length',
            sql`((kit_code_base IS NULL) OR (char_length(kit_code_base) <= 32))`,
          ),
          checkExpression(
            'catalog_product_name_has_both_languages',
            sql`((jsonb_typeof(name) = 'object'::text) AND (jsonb_typeof((name -> 'tr'::text)) = 'string'::text) AND (jsonb_typeof((name -> 'en'::text)) = 'string'::text))`,
          ),
          checkExpression(
            'catalog_product_regulatory_status_is_known',
            sql`(regulatory_status = ANY (ARRAY['IVD'::text, 'RUO'::text]))`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'catalog_catalog_number',
        constraint: 'catalog_number_unique',
        columns: ['catalog_number'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'catalog_lot',
        constraint: 'lot_unique_per_catalog_number',
        columns: ['catalog_number_id', 'lot_number'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'catalog_lot_import_row',
        constraint: 'lot_import_row_unique',
        columns: ['lot_import_id', 'row_number'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'catalog_product',
        constraint: 'product_unique_identity',
        columns: ['internal_code', 'regulatory_status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_catalog_number',
        index: 'catalog_catalog_number_product_idx',
        columns: ['product_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_lot',
        index: 'catalog_lot_catalog_number_id_idx_2e984c6f',
        columns: ['catalog_number_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_lot',
        index: 'catalog_lot_lot_import_idx',
        columns: ['lot_import_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_lot',
        index: 'lot_number_idx',
        columns: ['lot_number'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_lot_import',
        index: 'catalog_lot_import_product_id_idx_22a2b7d2',
        columns: ['product_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_lot_import',
        index: 'catalog_lot_import_source_hash_idx',
        columns: ['source_hash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_lot_import_row',
        index: 'catalog_lot_import_row_lot_idx',
        columns: ['lot_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'catalog_lot_import_row',
        index: 'catalog_lot_import_row_lot_import_id_idx_9c2a267d',
        columns: ['lot_import_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'catalog_catalog_number',
        foreignKey: {
          name: 'catalog_catalog_number_product_fk',
          columns: ['product_id'],
          references: { schema: 'public', table: 'catalog_product', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'catalog_lot',
        foreignKey: {
          name: 'catalog_lot_catalog_number_fk',
          columns: ['catalog_number_id'],
          references: { schema: 'public', table: 'catalog_catalog_number', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'catalog_lot',
        foreignKey: {
          name: 'catalog_lot_lot_import_fk',
          columns: ['lot_import_id'],
          references: { schema: 'public', table: 'catalog_lot_import', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'catalog_lot_import',
        foreignKey: {
          name: 'catalog_lot_import_product_fk',
          columns: ['product_id'],
          references: { schema: 'public', table: 'catalog_product', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'catalog_lot_import_row',
        foreignKey: {
          name: 'catalog_lot_import_row_lot_import_fk',
          columns: ['lot_import_id'],
          references: { schema: 'public', table: 'catalog_lot_import', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'catalog_lot_import_row',
        foreignKey: {
          name: 'catalog_lot_import_row_lot_fk',
          columns: ['lot_id'],
          references: { schema: 'public', table: 'catalog_lot', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      ...(
        [
          'catalog_product',
          'catalog_catalog_number',
          'catalog_lot',
          'catalog_lot_import',
          'catalog_lot_import_row',
        ] as const
      ).flatMap((table) => [refuseTrigger(table, 'DELETE'), refuseTrigger(table, 'TRUNCATE')]),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
