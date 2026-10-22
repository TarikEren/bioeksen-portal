/**
 * Catalog numbers (CAT-20, DEC-042).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * writes one audit row (PLT-40). A catalog number is unique in the whole catalog.
 * It moves to another product only while it has no LOT (CAT-20 rule 3). The
 * system never deletes a catalog number (DEC-010).
 *
 * MOCK: CAT-20. The functions read and write the mock store. Step 4 moves the
 * work to the repositories and one transaction for each change, with the same
 * signatures.
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { type MockCatalogNumber, getCatalogMock } from "@/lib/mock/catalog";
import {
  CATALOG_NUMBER_MAX,
  type CatalogNumberInput,
  type CatalogNumberView,
  type UpdateCatalogNumberInput,
} from "@/lib/schemas/catalog";

import { cleanTransport } from "../domain/lot-number";
import { recordAudit } from "./catalog-audit";
import { lotsOfCatalogNumber, notFound, toCatalogNumberView } from "./catalog-views";

function requireCatalogNumber(id: string): MockCatalogNumber {
  const found = getCatalogMock().catalogNumbers.get(id);
  if (found === undefined) {
    throw notFound();
  }
  return found;
}

function auditState(row: MockCatalogNumber): Record<string, unknown> {
  return { productId: row.productId, catalogNumber: row.catalogNumber, packSize: row.packSize, format: row.format, isActive: row.isActive };
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
  // MOCK: CAT-20 (create)
  const state = getCatalogMock();
  if (!state.products.has(productId)) {
    throw notFound();
  }
  const catalogNumber = cleanTransport(input.catalogNumber);
  if (catalogNumber === "" || catalogNumber.length > CATALOG_NUMBER_MAX) {
    throw validationError([{ code: "VAL-4006", entry: { field: "catalogNumber", issue: "is out of range" } }]);
  }
  if ([...state.catalogNumbers.values()].some((candidate) => candidate.catalogNumber === catalogNumber)) {
    throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the catalog number exists in the catalog" });
  }
  const created = now();
  const row: MockCatalogNumber = {
    id: String(state.nextCatalogNumberId),
    productId,
    catalogNumber,
    packSize: input.packSize ?? null,
    format: input.format ?? null,
    isActive: true,
    createdAt: created,
    updatedAt: created,
  };
  state.nextCatalogNumberId += 1;
  state.catalogNumbers.set(row.id, row);
  recordAudit(actor, {
    actionCode: "catalog.catalog_number.created",
    entityType: "catalog_catalog_number",
    entityId: row.id,
    stateBefore: null,
    stateAfter: auditState(row),
  });
  return toCatalogNumberView(row);
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
  // MOCK: CAT-20 (change, move)
  const state = getCatalogMock();
  const row = requireCatalogNumber(id);
  const moves = patch.productId !== undefined && patch.productId !== row.productId;
  if (patch.productId !== undefined && !state.products.has(patch.productId)) {
    throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: "is not a product" } }]);
  }
  if (moves && lotsOfCatalogNumber(row.id).length > 0) {
    throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "a catalog number with a LOT moves" });
  }

  const before = auditState(row);
  row.productId = patch.productId ?? row.productId;
  row.packSize = patch.packSize === undefined ? row.packSize : patch.packSize;
  row.format = patch.format === undefined ? row.format : patch.format;
  const after = auditState(row);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    row.updatedAt = now();
    recordAudit(actor, {
      actionCode: "catalog.catalog_number.changed",
      entityType: "catalog_catalog_number",
      entityId: row.id,
      stateBefore: before,
      stateAfter: after,
    });
  }
  return toCatalogNumberView(row);
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
  // MOCK: CAT-20 (deactivate)
  const row = requireCatalogNumber(id);
  if (!row.isActive) {
    throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the catalog number is inactive" });
  }
  row.isActive = false;
  row.updatedAt = now();
  recordAudit(actor, {
    actionCode: "catalog.catalog_number.deactivated",
    entityType: "catalog_catalog_number",
    entityId: row.id,
    stateBefore: { isActive: true },
    stateAfter: { isActive: false },
  });
  return toCatalogNumberView(row);
}
