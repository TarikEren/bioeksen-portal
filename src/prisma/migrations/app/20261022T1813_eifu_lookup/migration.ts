#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/437f9273d9a04bf95f19b497029e2b556aadc2b3f3d7921758f2c1b19c4a00a6/contract';
import endContract from '../../snapshots/437f9273d9a04bf95f19b497029e2b556aadc2b3f3d7921758f2c1b19c4a00a6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/611d61f0e7bd6becd3659f2734221f3eb0e11f628c9a533e5a893de8dcfde676/contract';
import startContract from '../../snapshots/611d61f0e7bd6becd3659f2734221f3eb0e11f628c9a533e5a893de8dcfde676/contract.json' with { type: 'json' };
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

// DEC-010, DEC-005: `eifu_access_record` is a controlled record. Its DELETE and
// TRUNCATE triggers are raw operations of the migration that creates the table,
// and use `platform_refuse_delete()` of the migration
// `platform_log_record_constraints`. The drift check cannot see them: an
// integration test proves that each one exists.
function refuseTrigger(table: string, event: 'DELETE' | 'TRUNCATE') {
  const name = `${table}_refuse_${event.toLowerCase()}`;
  const scope = event === 'TRUNCATE' ? 'STATEMENT' : 'ROW';
  const exists = `EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${name}' AND tgrelid = to_regclass('public.${table}'))`;
  return rawSql({
    id: `trigger.${name}`,
    label: `Create trigger "${name}"`,
    operationClass: 'additive',
    target: { id: 'postgres' },
    precheck: [{ description: `ensure trigger "${name}" is not there`, sql: `SELECT NOT (${exists}) AS "result"`, params: [] }],
    execute: [
      {
        description: `create trigger "${name}"`,
        sql: `CREATE TRIGGER "${name}" BEFORE ${event} ON "public"."${table}" FOR EACH ${scope} EXECUTE FUNCTION "public"."platform_refuse_delete"()`,
        params: [],
      },
    ],
    postcheck: [{ description: `verify trigger "${name}" exists`, sql: `SELECT (${exists}) AS "result"`, params: [] }],
  });
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'eifu_access_record',
        columns: [
          col('acknowledged_notice_version', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('anonymized_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('catalog_number_input', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('client_address', 'bytea', { codecRef: { codecId: 'pg/bytea@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('email', 'bytea', { codecRef: { codecId: 'pg/bytea@1' } }),
          col('email_lookup_hash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email_verified', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('identity_key_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lot_number_input', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('outcome', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('request_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resolved_document_version_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('resolved_product_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('resolved_via_override', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('user_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'access_record_anonymized_keeps_no_identity',
            sql`((anonymized_at IS NULL) OR ((email IS NULL) AND (client_address IS NULL) AND (email_lookup_hash IS NULL) AND (identity_key_id IS NULL)))`,
          ),
          checkExpression(
            'access_record_outcome_is_known',
            sql`(outcome = ANY (ARRAY['RESOLVED'::text, 'CATALOG_NUMBER_NOT_FOUND'::text, 'LOT_NOT_FOUND'::text, 'LOT_CATALOG_MISMATCH'::text, 'LOT_DATE_CONFLICT'::text, 'NO_APPLICABLE_VERSION'::text, 'AMBIGUOUS_APPLICABILITY'::text, 'NO_FILE_FOR_VERSION'::text, 'OVERRIDE_TARGET_NOT_PUBLISHED'::text]))`,
          ),
          checkExpression(
            'access_record_user_agent_length',
            sql`((user_agent IS NULL) OR (char_length(user_agent) <= 512))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'eifu_verification',
        columns: [
          col('attempts_used', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('catalog_number_input', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('client_address', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('code_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('email', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('email_lookup_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ended_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('expires_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('identity_key_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lot_number_input', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notice_version', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('public_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('send_failed_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('used_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('user_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'verification_attempts_in_range',
            sql`((attempts_used >= 0) AND (attempts_used <= 5))`,
          ),
          checkExpression(
            'verification_inputs_length',
            sql`((char_length(catalog_number_input) <= 256) AND (char_length(lot_number_input) <= 256))`,
          ),
          checkExpression(
            'verification_user_agent_length',
            sql`((user_agent IS NULL) OR (char_length(user_agent) <= 512))`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'eifu_verification',
        constraint: 'verification_public_id_unique',
        columns: ['public_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_access_record',
        index: 'access_record_created_at_anonymized_at_idx',
        columns: ['created_at', 'anonymized_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_verification',
        index: 'eifu_verification_ended_at_idx',
        columns: ['ended_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'eifu_verification',
        index: 'eifu_verification_expires_at_idx',
        columns: ['expires_at'],
      }),
      refuseTrigger('eifu_access_record', 'DELETE'),
      refuseTrigger('eifu_access_record', 'TRUNCATE'),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
