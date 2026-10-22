/**
 * The audit record of a controlled change (PLT-40, DEC-014).
 *
 * `appendAudit` runs in the transaction of the change. The row of
 * `platform_audit_record` and the `AUDIT` log record commit or roll back with
 * the change (PLT-40.AC1, AC2). The row never holds the email address or the
 * client address of a lookup visitor (PLT-40 rule 3).
 */
import "server-only";

import { logger } from "@/lib/logging";
import { identityMock } from "@/lib/mock/identity";
import type { MockTransaction } from "@/lib/mock/transaction";
import { findRequestContext } from "@/lib/request-context";

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
  readonly stateBefore: Readonly<Record<string, unknown>> | null;
  readonly stateAfter: Readonly<Record<string, unknown>> | null;
  /** The reason, for an action that needs one (PLT-40.AC4). */
  readonly reason?: string;
}

/**
 * Appends one audit row and writes one `AUDIT` log record, inside `tx`.
 *
 * @param tx The transaction of the change.
 * @param entry What changed. It holds ids and flags, never a secret.
 */
// MOCK: PLT-40
export function appendAudit(tx: MockTransaction, entry: AuditEntry): Promise<void> {
  const requestId = findRequestContext()?.requestId ?? null;
  tx.afterCommit(() => {
    const state = identityMock();
    state.audit.push({
      id: String(state.nextAuditId++),
      occurredAt: new Date(),
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
    logger.write({
      severity: "INFO",
      type: "AUDIT",
      message: "controlled change recorded",
      tail: {
        action: entry.actionCode,
        entity: entry.entityType,
        entityId: entry.entityId,
        actor: entry.actor.type === "USER" ? entry.actor.userId : "system",
      },
    });
  });
  return Promise.resolve();
}
