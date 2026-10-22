#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5b66d4508fcbc247ae27a362a84135cc6cfc3ca1a49f77330d30b18f240615a5/contract';
import startContract from '../../snapshots/5b66d4508fcbc247ae27a362a84135cc6cfc3ca1a49f77330d30b18f240615a5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/eca4a59f5254f24a70d12d673bf8ae09b29ae0e6e05b9a0f87d1f7ee578e5675/contract';
import endContract from '../../snapshots/eca4a59f5254f24a70d12d673bf8ae09b29ae0e6e05b9a0f87d1f7ee578e5675/contract.json' with { type: 'json' };
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

// DEC-010, DEC-014, PLT-40: the triggers that refuse the removal of a controlled
// record. `platform_refuse_delete()` is the function of the migration
// `platform_log_record_constraints` (FND-06 rule 5). A trigger is not part of the
// contract, so each one is a raw operation of the migration that creates its
// table (DEC-005). The drift check cannot see them: an integration test proves
// that each one exists. `platform_audit_record` is append-only, so it refuses
// UPDATE too.
type RefusedEvent = 'DELETE' | 'UPDATE' | 'TRUNCATE';

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
        table: 'identity_auth_token',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('created_by_user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('ended_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('expires_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('purpose', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('token_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('used_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'identity_auth_token_purpose_is_known',
            sql`(purpose = ANY (ARRAY['INVITATION'::text, 'PASSWORD_RESET'::text]))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'identity_permission',
        columns: [
          col('code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'identity_role',
        columns: [
          col('code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('name', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'identity_role_name_has_both_languages',
            sql`((jsonb_typeof(name) = 'object'::text) AND (jsonb_typeof((name -> 'tr'::text)) = 'string'::text) AND (jsonb_typeof((name -> 'en'::text)) = 'string'::text))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'identity_role_assignment',
        columns: [
          col('granted_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('granted_by_user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('revoked_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('revoked_by_user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('role_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'identity_role_permission',
        columns: [
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('permission_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('role_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'identity_user',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('email_normalized', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('first_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('last_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('password_changed_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('password_hash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('preferred_language', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'identity_user_email_normalized_is_lower',
            sql`(email_normalized = lower(email_normalized))`,
          ),
          checkExpression(
            'identity_user_preferred_language_is_known',
            sql`(preferred_language = ANY (ARRAY['tr'::text, 'en'::text]))`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'platform_audit_record',
        columns: [
          col('action_code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actor_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actor_user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('entity_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('entity_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('occurred_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('request_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('state_after', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('state_before', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'audit_record_action_code_form',
            sql`(action_code ~ '^[a-z][a-z0-9_]*[.][a-z][a-z0-9_]*[.][a-z][a-z0-9_]*$'::text)`,
          ),
          checkExpression(
            'audit_record_actor_matches_type',
            sql`((actor_type = 'USER'::text) = (actor_user_id IS NOT NULL))`,
          ),
          checkExpression(
            'audit_record_actor_type_is_known',
            sql`(actor_type = ANY (ARRAY['USER'::text, 'SYSTEM'::text]))`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'identity_auth_token',
        constraint: 'identity_auth_token_hash_unique',
        columns: ['token_hash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'identity_permission',
        constraint: 'identity_permission_code_unique',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'identity_role',
        constraint: 'identity_role_code_unique',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'identity_role_permission',
        constraint: 'identity_role_permission_pair_unique',
        columns: ['role_id', 'permission_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'identity_user',
        constraint: 'identity_user_email_unique',
        columns: ['email_normalized'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_auth_token',
        index: 'identity_auth_token_created_by_user_id_idx_764eade2',
        columns: ['created_by_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_auth_token',
        index: 'identity_auth_token_one_unused_unique',
        columns: ['user_id', 'purpose'],
        extras: { where: sql`((used_at IS NULL) AND (ended_at IS NULL))`, unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_auth_token',
        index: 'identity_auth_token_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_role_assignment',
        index: 'identity_role_assignment_granted_by_user_id_idx_d055b00f',
        columns: ['granted_by_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_role_assignment',
        index: 'identity_role_assignment_one_active_unique',
        columns: ['user_id', 'role_id'],
        extras: { where: sql`is_active`, unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_role_assignment',
        index: 'identity_role_assignment_revoked_by_user_id_idx_f61d96ba',
        columns: ['revoked_by_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_role_assignment',
        index: 'identity_role_assignment_role_id_idx_d9467c50',
        columns: ['role_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_role_assignment',
        index: 'identity_role_assignment_user_idx',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_role_permission',
        index: 'identity_role_permission_permission_id_idx_909cec36',
        columns: ['permission_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'identity_role_permission',
        index: 'identity_role_permission_role_id_idx_d9467c50',
        columns: ['role_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_audit_record',
        index: 'platform_audit_record_entity_idx',
        columns: ['entity_type', 'entity_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_audit_record',
        index: 'platform_audit_record_occurred_at_idx',
        columns: ['occurred_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_auth_token',
        foreignKey: {
          name: 'identity_auth_token_user_fk',
          columns: ['user_id'],
          references: { schema: 'public', table: 'identity_user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_auth_token',
        foreignKey: {
          name: 'identity_auth_token_created_by_fk',
          columns: ['created_by_user_id'],
          references: { schema: 'public', table: 'identity_user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_role_assignment',
        foreignKey: {
          name: 'identity_role_assignment_user_fk',
          columns: ['user_id'],
          references: { schema: 'public', table: 'identity_user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_role_assignment',
        foreignKey: {
          name: 'identity_role_assignment_role_fk',
          columns: ['role_id'],
          references: { schema: 'public', table: 'identity_role', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_role_assignment',
        foreignKey: {
          name: 'identity_role_assignment_granted_by_fk',
          columns: ['granted_by_user_id'],
          references: { schema: 'public', table: 'identity_user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_role_assignment',
        foreignKey: {
          name: 'identity_role_assignment_revoked_by_fk',
          columns: ['revoked_by_user_id'],
          references: { schema: 'public', table: 'identity_user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_role_permission',
        foreignKey: {
          name: 'identity_role_permission_role_fk',
          columns: ['role_id'],
          references: { schema: 'public', table: 'identity_role', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'identity_role_permission',
        foreignKey: {
          name: 'identity_role_permission_permission_fk',
          columns: ['permission_id'],
          references: { schema: 'public', table: 'identity_permission', columns: ['id'] },
        },
      }),
      ...(['identity_user', 'identity_role_assignment'] as const).flatMap((table) => [
        refuseTrigger(table, 'DELETE'),
        refuseTrigger(table, 'TRUNCATE'),
      ]),
      refuseTrigger('platform_audit_record', 'UPDATE'),
      refuseTrigger('platform_audit_record', 'DELETE'),
      refuseTrigger('platform_audit_record', 'TRUNCATE'),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
