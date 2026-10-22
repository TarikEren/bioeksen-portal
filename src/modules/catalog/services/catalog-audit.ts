/**
 * The audit rows of the catalog (PLT-40, DEC-014). The actions are the list of
 * the B2 contract, **Data**.
 *
 * `recordAudit` calls `appendAudit` of the platform service inside the
 * transaction of the change, so that the row and the change commit or roll back
 * together (PLT-40.AC1, AC2).
 */
import "server-only";

import type { SessionActor } from "@/lib/auth/session";
import type { JsonValue } from "@/lib/errors";
import type { Transaction } from "@/lib/transaction";
import { appendAudit } from "@/modules/platform/services/audit-service";

export type CatalogAuditAction =
  | "catalog.product.created"
  | "catalog.product.changed"
  | "catalog.product.deactivated"
  | "catalog.catalog_number.created"
  | "catalog.catalog_number.changed"
  | "catalog.catalog_number.deactivated"
  | "catalog.lot.registered"
  | "catalog.lot.manufacturing_date_corrected"
  | "catalog.lot_import.committed";

/** The state of an entity: ids, flags and dates as JSON. It never holds a secret. */
export type CatalogAuditState = { readonly [key: string]: JsonValue };

export interface CatalogAuditEntry {
  readonly actionCode: CatalogAuditAction;
  readonly entityType: "catalog_product" | "catalog_catalog_number" | "catalog_lot" | "catalog_lot_import";
  readonly entityId: string;
  /** The state before the change. `null` for a creation. */
  readonly stateBefore: CatalogAuditState | null;
  readonly stateAfter: CatalogAuditState | null;
  readonly reason?: string;
}

/**
 * Writes one audit row for the actor, inside `tx`.
 *
 * @throws AppError The failure of the store. The change then rolls back.
 */
export async function recordAudit(tx: Transaction, actor: SessionActor, entry: CatalogAuditEntry): Promise<void> {
  await appendAudit(tx, {
    actor: { type: "USER", userId: actor.userId },
    actionCode: entry.actionCode,
    entityType: entry.entityType,
    entityId: entry.entityId,
    stateBefore: entry.stateBefore,
    stateAfter: entry.stateAfter,
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  });
}
