/**
 * The audit rows of the catalog (PLT-40). The actions are the list of the B2
 * contract, **Data**.
 *
 * MOCK: PLT-40. The row goes to the mock store. Step 4 calls `appendAudit` of
 * the platform service inside the transaction of the change, so that the row and
 * the change commit or roll back together.
 */
import "server-only";

import type { SessionActor } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { appendMockAudit } from "@/lib/mock/catalog";

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

export interface CatalogAuditEntry {
  readonly actionCode: CatalogAuditAction;
  readonly entityType: "catalog_product" | "catalog_catalog_number" | "catalog_lot" | "catalog_lot_import";
  readonly entityId: string;
  /** The state before the change. `null` for a creation. It holds ids, flags and dates, never a secret. */
  readonly stateBefore: Readonly<Record<string, unknown>> | null;
  readonly stateAfter: Readonly<Record<string, unknown>> | null;
  readonly reason?: string;
}

/** Writes one audit row for the actor. */
export function recordAudit(actor: SessionActor, entry: CatalogAuditEntry): void {
  // MOCK: PLT-40
  appendMockAudit({ ...entry, actorUserId: actor.userId }, now());
}
