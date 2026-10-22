/**
 * Catalog numbers (CAT-20, DEC-042).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * runs in one transaction with its audit row (PLT-40). A catalog number is
 * unique in the whole catalog. It moves to another product only while it has no
 * LOT (CAT-20 rule 3). The system never deletes a catalog number (DEC-010).
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { type Executor, runTransaction } from "@/lib/transaction";
import {
  CATALOG_NUMBER_MAX,
  type CatalogNumberInput,
  type CatalogNumberView,
  type UpdateCatalogNumberInput,
} from "@/lib/schemas/catalog";

import { cleanTransport } from "../domain/lot-number";
import {
  type CatalogNumberRow,
  findCatalogNumberById,
  findCatalogNumbersByValues,
  insertCatalogNumber,
  markCatalogNumberInactive,
  updateCatalogNumberRow,
} from "../repositories/catalog-number-repository";
import { countLotsOfCatalogNumbers } from "../repositories/lot-repository";
import { findProductById } from "../repositories/product-repository";
import { type CatalogAuditState, recordAudit } from "./catalog-audit";
import { notFound, requireCatalogId, toCatalogNumberView } from "./catalog-views";

/** The catalog number with the text id, locked for a change when `lock` is set. @throws AppError `RES-4200`. */
async function requireCatalogNumber(executor: Executor, id: string, lock: "none" | "update" = "none"): Promise<CatalogNumberRow> {
  const found = await findCatalogNumberById(executor, requireCatalogId(id), lock);
  if (found === null) {
    throw notFound();
  }
  return found;
}

function auditState(row: Pick<CatalogNumberRow, "productId" | "catalogNumber" | "packSize" | "format" | "isActive">): CatalogAuditState {
  return {
    productId: String(row.productId),
    catalogNumber: row.catalogNumber,
    packSize: row.packSize,
    format: row.format,
    isActive: row.isActive,
  };
}

async function viewOf(executor: Executor, row: CatalogNumberRow): Promise<CatalogNumberView> {
  return toCatalogNumberView(row, await countLotsOfCatalogNumbers(executor, [row.id]));
}

/**
 * Adds a catalog number to a product. Transport cleanup runs once, here
 * (CAT-20 rule 2, CAT-20.AC3). The creation has one audit row (CAT-20.AC1).
 *
 * @throws AppError `PERM-4150` without `catalog.catalog_number.manage`; `RES-4200`
 * for a product that does not exist; `VAL-4006` for a catalog number that is
 * blank or too long after cleanup; `RES-4300` when the catalog number exists
 * under any product (CAT-20.AC2).
 */
export async function addCatalogNumber(
  actor: SessionActor,
  productId: string,
  input: CatalogNumberInput,
): Promise<CatalogNumberView> {
  requirePermission(actor, "catalog.catalog_number.manage");
  const productKey = requireCatalogId(productId);
  const catalogNumber = cleanTransport(input.catalogNumber);
  return runTransaction(async (tx) => {
    if ((await findProductById(tx, productKey)) === null) {
      throw notFound();
    }
    if (catalogNumber === "" || catalogNumber.length > CATALOG_NUMBER_MAX) {
      throw validationError([{ code: "VAL-4006", entry: { field: "catalogNumber", issue: "is out of range" } }]);
    }
    // A second creation with the same value between this check and the insert
    // fails on `catalog_number_unique` with the same `RES-4300`.
    if ((await findCatalogNumbersByValues(tx, [catalogNumber])).length > 0) {
      throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the catalog number exists in the catalog" });
    }
    const row = await insertCatalogNumber(tx, {
      productId: productKey,
      catalogNumber,
      packSize: input.packSize ?? null,
      format: input.format ?? null,
      now: now(),
    });
    await recordAudit(tx, actor, {
      actionCode: "catalog.catalog_number.created",
      entityType: "catalog_catalog_number",
      entityId: String(row.id),
      stateBefore: null,
      stateAfter: auditState(row),
    });
    return toCatalogNumberView(row, 0);
  });
}

/**
 * Changes a catalog number with a JSON Merge Patch (RFC 7396). A new `productId`
 * moves it. A patch that changes nothing writes no audit row. A move is a
 * `changed` row with the product before and after.
 *
 * @throws AppError `PERM-4150` without `catalog.catalog_number.manage`; `RES-4200`;
 * `VAL-4006` when `productId` names no product; `RES-4302` for a move while the
 * catalog number has a LOT (CAT-20.AC4).
 */
export async function updateCatalogNumber(
  actor: SessionActor,
  id: string,
  patch: UpdateCatalogNumberInput,
): Promise<CatalogNumberView> {
  requirePermission(actor, "catalog.catalog_number.manage");
  return runTransaction(async (tx) => {
    // The row stays locked until the commit: a LOT registration takes a shared
    // lock of the catalog number, so it cannot slip in between the check and the move.
    const row = await requireCatalogNumber(tx, id, "update");
    const targetKey = patch.productId === undefined ? null : requireTargetId(patch.productId);
    const moves = targetKey !== null && targetKey !== row.productId;
    if (targetKey !== null && (await findProductById(tx, targetKey)) === null) {
      throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: "is not a product" } }]);
    }
    if (moves && (await countLotsOfCatalogNumbers(tx, [row.id])) > 0) {
      throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "a catalog number with a LOT moves" });
    }

    const changed: CatalogNumberRow = {
      ...row,
      productId: targetKey ?? row.productId,
      packSize: patch.packSize === undefined ? row.packSize : patch.packSize,
      format: patch.format === undefined ? row.format : patch.format,
    };
    const before = auditState(row);
    const after = auditState(changed);
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return viewOf(tx, row);
    }
    const at = now();
    await updateCatalogNumberRow(tx, row.id, { productId: changed.productId, packSize: changed.packSize, format: changed.format, now: at });
    await recordAudit(tx, actor, {
      actionCode: "catalog.catalog_number.changed",
      entityType: "catalog_catalog_number",
      entityId: String(row.id),
      stateBefore: before,
      stateAfter: after,
    });
    return viewOf(tx, { ...changed, updatedAt: at });
  });
}

/** The key of the product of a move. A text that is no id names no product (`VAL-4006`, as a product that does not exist). */
function requireTargetId(productId: string): bigint {
  try {
    return requireCatalogId(productId);
  } catch {
    throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: "is not a product" } }]);
  }
}

/**
 * Deactivates a catalog number. The row stays, and a lookup still finds it
 * (CAT-20 rule 4, CAT-20.AC5). The deactivation has one audit row.
 *
 * @throws AppError `PERM-4150` without `catalog.catalog_number.manage`; `RES-4200`;
 * `RES-4302` when the catalog number is inactive.
 */
export async function deactivateCatalogNumber(actor: SessionActor, id: string): Promise<CatalogNumberView> {
  requirePermission(actor, "catalog.catalog_number.manage");
  return runTransaction(async (tx) => {
    const row = await requireCatalogNumber(tx, id, "update");
    if (!row.isActive) {
      throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the catalog number is inactive" });
    }
    const at = now();
    await markCatalogNumberInactive(tx, row.id, at);
    await recordAudit(tx, actor, {
      actionCode: "catalog.catalog_number.deactivated",
      entityType: "catalog_catalog_number",
      entityId: String(row.id),
      stateBefore: { isActive: true },
      stateAfter: { isActive: false },
    });
    return viewOf(tx, { ...row, isActive: false, updatedAt: at });
  });
}
