/**
 * The table `platform_audit_record` (PLT-40, DEC-014). It holds queries and
 * nothing else. The table is append-only: its triggers refuse UPDATE, DELETE and
 * TRUNCATE (DEC-010), so this file has an insert and no other write.
 */
import "server-only";

import type { Executor } from "@/lib/db";
import { toColumnInstant } from "@/lib/db";
import type { JsonValue } from "@/lib/errors";

/** The state of an entity: ids and flags as JSON. It never holds a secret. */
export type JsonObject = { readonly [key: string]: JsonValue };

export interface NewAuditRecord {
  readonly occurredAt: Date;
  readonly actorType: "USER" | "SYSTEM";
  /** The user id as the text of the `bigint` key. `null` for the actor `SYSTEM`. */
  readonly actorUserId: string | null;
  readonly actionCode: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly stateBefore: JsonObject | null;
  readonly stateAfter: JsonObject | null;
  readonly reason: string | null;
  readonly requestId: string | null;
}

/** Appends one audit row through `executor`, the transaction of the change. */
export async function insertAuditRecord(executor: Executor, record: NewAuditRecord): Promise<void> {
  await executor.orm.public.PlatformAuditRecord.create({
    occurredAt: toColumnInstant(record.occurredAt),
    actorType: record.actorType,
    actorUserId: record.actorUserId === null ? null : BigInt(record.actorUserId),
    actionCode: record.actionCode,
    entityType: record.entityType,
    entityId: record.entityId,
    stateBefore: record.stateBefore,
    stateAfter: record.stateAfter,
    reason: record.reason,
    requestId: record.requestId,
  });
}
