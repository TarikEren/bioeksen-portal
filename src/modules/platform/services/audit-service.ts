/**
 * The audit record of a controlled change (PLT-40, DEC-014).
 *
 * `appendAudit` runs in the transaction of the change. The row of
 * `platform_audit_record` and the `AUDIT` log record commit or roll back with
 * the change (PLT-40.AC1, AC2). The row never holds the email address or the
 * client address of a lookup visitor (PLT-40 rule 3).
 */
import "server-only";

import { now } from "@/lib/clock";
import type { Transaction } from "@/lib/transaction";
import { logger } from "@/lib/logging";
import { findRequestContext } from "@/lib/request-context";

import { type JsonObject, insertAuditRecord } from "../repositories/audit-repository";

/** The actions of release 1 that the items mark as audited, as `<module>.<entity>.<verb>`. */
export type AuditActionCode =
  | "identity.user.created"
  | "identity.user.invited"
  | "identity.user.deactivated"
  | "identity.role_assignment.granted"
  | "identity.role_assignment.revoked";

export type AuditActor = { readonly type: "USER"; readonly userId: string } | { readonly type: "SYSTEM" };

export interface AuditEntry {
  readonly actor: AuditActor;
  readonly actionCode: AuditActionCode;
  readonly entityType: string;
  /** The id of the entity, as text. */
  readonly entityId: string;
  /** The state before the change. `null` for a creation. */
  readonly stateBefore: JsonObject | null;
  readonly stateAfter: JsonObject | null;
  /** The reason, for an action that needs one (PLT-40.AC4). */
  readonly reason?: string;
}

/**
 * Appends one audit row and one `AUDIT` log record, inside `tx`. Both are in the
 * transaction, so a rollback leaves neither (PLT-40.AC2). Both carry the request
 * id of the request (PLT-40.AC3). The record is printed to stdout after the
 * commit, so a rolled back change leaves no line there either.
 *
 * @param tx The transaction of the change.
 * @param entry What changed. It holds ids and flags, never a secret.
 * @throws AppError The failure of the store. The change then rolls back.
 */
export async function appendAudit(tx: Transaction, entry: AuditEntry): Promise<void> {
  const requestId = findRequestContext()?.requestId ?? null;
  await insertAuditRecord(tx, {
    occurredAt: now(),
    actorType: entry.actor.type,
    actorUserId: entry.actor.type === "USER" ? entry.actor.userId : null,
    actionCode: entry.actionCode,
    entityType: entry.entityType,
    entityId: entry.entityId,
    stateBefore: entry.stateBefore,
    stateAfter: entry.stateAfter,
    reason: entry.reason ?? null,
    requestId,
  });
  const print = await logger.writeAudit(
    {
      message: "controlled change recorded",
      tail: {
        action: entry.actionCode,
        entity: entry.entityType,
        entityId: entry.entityId,
        actor: entry.actor.type === "USER" ? entry.actor.userId : "system",
        ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      },
    },
    tx,
  );
  tx.afterCommit(print);
}
