#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/06d25668fc404834138e87b8e314f4979f0bab9492b75fe398bbb035ca57db9f/contract';
import startContract from '../../snapshots/06d25668fc404834138e87b8e314f4979f0bab9492b75fe398bbb035ca57db9f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5b66d4508fcbc247ae27a362a84135cc6cfc3ca1a49f77330d30b18f240615a5/contract';
import endContract from '../../snapshots/5b66d4508fcbc247ae27a362a84135cc6cfc3ca1a49f77330d30b18f240615a5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addCheckConstraint({
        schema: 'public',
        table: 'platform_log_record',
        constraint: 'log_record_message_length',
        expression: sql`(char_length(message) <= 8192)`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'platform_log_record',
        constraint: 'log_record_severity_is_known',
        expression: sql`(severity = ANY (ARRAY['DEBUG'::text, 'INFO'::text, 'WARNING'::text, 'ERROR'::text, 'FATAL'::text]))`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'platform_log_record',
        constraint: 'log_record_type_is_known',
        expression: sql`(type = ANY (ARRAY['APP'::text, 'SECURITY'::text, 'AUDIT'::text, 'ACCESS'::text, 'JOB'::text]))`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_log_record',
        index: 'platform_log_record_code_idx',
        columns: ['code'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_log_record',
        index: 'platform_log_record_timestamp_id_idx',
        columns: ['timestamp', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_log_record',
        index: 'platform_log_record_type_severity_idx',
        columns: ['type', 'severity'],
      }),
      // FND-06 rule 5, DEC-005: the function that the triggers of the controlled
      // tables call. A function is not part of the contract, so it is a raw
      // operation of this migration. The triggers come with the migration that
      // creates each controlled table. The drift check cannot see this function:
      // an integration test proves that it exists.
      rawSql({
        id: 'function.platform_refuse_delete',
        label: 'Create function "platform_refuse_delete"',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [
          {
            description: 'ensure function "platform_refuse_delete" does not exist',
            sql: `SELECT (to_regprocedure('public.platform_refuse_delete()')) IS NULL AS "result"`,
            params: [],
          },
        ],
        execute: [
          {
            description: 'create function "platform_refuse_delete"',
            sql: `CREATE FUNCTION "public"."platform_refuse_delete"() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION '% on % is refused: the system never deletes a controlled record', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$function$`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify function "platform_refuse_delete" exists',
            sql: `SELECT (to_regprocedure('public.platform_refuse_delete()')) IS NOT NULL AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
