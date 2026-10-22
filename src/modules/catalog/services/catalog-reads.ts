/**
 * The small reads that other modules need (DEC-004: a module reaches the data of
 * another module through its service, never through its repository). The e-IFU
 * module reads a product by its id, and a LOT with its catalog number and its
 * product (IFU-10, IFU-40).
 *
 * A read answers `null` for an id that names no record, and the caller decides
 * what that means. Each function checks the permission of the actor. A person
 * who may see a document or manage an override sees the product and the LOT that
 * the document or the override names, so those permissions are in the list.
 */
import "server-only";

import { type SessionActor } from "@/lib/auth/session";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import type { LotRef, ProductRef } from "@/lib/schemas/catalog";
import type { PermissionCode } from "@/lib/schemas/identity";
import { readExecutor } from "@/lib/transaction";

import { findCatalogNumberById } from "../repositories/catalog-number-repository";
import { findLotById } from "../repositories/lot-repository";
import { type ProductRow, findProductById, findProductsByIds } from "../repositories/product-repository";
import { parseCatalogId } from "./catalog-views";

/** The permissions that allow a read of a product or a LOT reference. */
const REFERENCE_READERS: readonly PermissionCode[] = [
  "catalog.product.view",
  "catalog.lot.view",
  "eifu.document.view",
  "eifu.document.manage",
  "eifu.lot_override.manage",
];

/** @throws AppError `PERM-4150` when the actor holds none of the permissions of `REFERENCE_READERS`. */
function requireReader(actor: SessionActor): void {
  if (!REFERENCE_READERS.some((permission) => actor.permissions.has(permission))) {
    throw new AppError("PERM-4150", "Not permitted", { reason: "the actor lacks a permission to read a product or a LOT" });
  }
}

function toProductRef(row: ProductRow): ProductRef {
  return {
    id: String(row.id),
    internalCode: row.internalCode,
    name: row.name,
    regulatoryStatus: row.regulatoryStatus,
    isActive: row.isActive,
  };
}

/**
 * The product with the id, or `null` when the id is malformed or names no product.
 *
 * @throws AppError `PERM-4150`.
 */
export async function findProductRef(actor: SessionActor, id: string): Promise<ProductRef | null> {
  requireReader(actor);
  const key = parseCatalogId(id);
  if (key === null) {
    return null;
  }
  const row = await findProductById(readExecutor(), key);
  return row === null ? null : toProductRef(row);
}

/**
 * The products with the ids, by id. An id that names no product is not in the map.
 *
 * @throws AppError `PERM-4150`.
 */
export async function findProductRefs(actor: SessionActor, ids: readonly string[]): Promise<Map<string, ProductRef>> {
  requireReader(actor);
  const keys = ids.flatMap((id) => {
    const key = parseCatalogId(id);
    return key === null ? [] : [key];
  });
  const rows = await findProductsByIds(readExecutor(), keys);
  return new Map(rows.map((row) => [String(row.id), toProductRef(row)]));
}

/**
 * The LOT with the id, with its catalog number and its product, or `null` when
 * the id is malformed or names no LOT.
 *
 * @throws AppError `PERM-4150`; `DB-5000` when a LOT has no catalog number or no product (the store is broken).
 */
export async function findLotRef(actor: SessionActor, id: string): Promise<LotRef | null> {
  requireReader(actor);
  const key = parseCatalogId(id);
  if (key === null) {
    return null;
  }
  const executor = readExecutor();
  const lot = await findLotById(executor, key);
  if (lot === null) {
    return null;
  }
  const catalogNumber = await findCatalogNumberById(executor, lot.catalogNumberId);
  const product = catalogNumber === null ? null : await findProductById(executor, catalogNumber.productId);
  if (catalogNumber === null || product === null) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a LOT has no catalog number or no product" });
  }
  return {
    id: String(lot.id),
    lotNumber: lot.lotNumber,
    manufacturingDate: lot.manufacturingDate,
    hasDateConflict: lot.hasDateConflict,
    catalogNumberId: String(catalogNumber.id),
    catalogNumber: catalogNumber.catalogNumber,
    productId: String(product.id),
    product: toProductRef(product),
  };
}
