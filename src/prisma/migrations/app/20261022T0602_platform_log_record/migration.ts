#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/06d25668fc404834138e87b8e314f4979f0bab9492b75fe398bbb035ca57db9f/contract';
import endContract from '../../snapshots/06d25668fc404834138e87b8e314f4979f0bab9492b75fe398bbb035ca57db9f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'platform_log_record',
        columns: [
          col('code', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('severity', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shipped_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('software_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('timestamp', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
