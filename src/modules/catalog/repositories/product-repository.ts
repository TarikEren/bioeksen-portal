/**
 * The table `catalog_product` (CAT-10). It holds queries and nothing else. It
 * never decides who may do what, and it never deletes a row: the triggers of the
 * table refuse DELETE and TRUNCATE (DEC-010).
 *
 * A function takes an `Executor`: the transaction of the service, or the client
 * for a read that needs none.
 */
import "server-only";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";
import type { LocalizedDescription, LocalizedName, RegulatoryStatus } from "@/lib/schemas/catalog";

import { type RowLock, toRegulatoryStatus, toStoredText } from "./stored-values";

/** One product as the services read it. A time is an instant, and an id is the `bigint` key. */
export interface ProductRow {
  readonly id: bigint;
  readonly internalCode: string;
  readonly name: LocalizedName;
  readonly description: LocalizedDescription | null;
  readonly regulatoryStatus: RegulatoryStatus;
  readonly kitCodeBase: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewProduct {
  readonly internalCode: string;
  readonly name: LocalizedName;
  readonly description: LocalizedDescription | null;
  readonly regulatoryStatus: RegulatoryStatus;
  readonly kitCodeBase: string | null;
  readonly now: Date;
}

/** The fields of a change. Each one is a full value: the service merges the patch (RFC 7396) before it calls. */
export interface ProductChanges {
  readonly internalCode: string;
  readonly name: LocalizedName;
  readonly description: LocalizedDescription | null;
  readonly regulatoryStatus: RegulatoryStatus;
  readonly kitCodeBase: string | null;
  readonly now: Date;
}

interface StoredProduct {
  readonly id: bigint;
  readonly internalCode: string;
  readonly name: unknown;
  readonly description: unknown;
  readonly regulatoryStatus: string;
  readonly kitCodeBase: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toProductRow(row: StoredProduct): ProductRow {
  return {
    id: row.id,
    internalCode: row.internalCode,
    name: toStoredText(row.name),
    description: row.description === null ? null : toStoredText(row.description),
    regulatoryStatus: toRegulatoryStatus(row.regulatoryStatus),
    kitCodeBase: row.kitCodeBase,
    isActive: row.isActive,
    createdAt: fromColumnInstant(row.createdAt),
    updatedAt: fromColumnInstant(row.updatedAt),
  };
}

/**
 * The product with the id, or `null`. `share` and `update` lock the row, so a
 * check and the write that follows it see the same row (`sds-database` §5). A
 * LOT registration takes `share`, and a change of the stem or the status takes
 * `update`: the two cannot run at once (CAT-10 rule 3). A lock needs a
 * transaction.
 */
export async function findProductById(executor: Executor, id: bigint, lock: RowLock = "none"): Promise<ProductRow | null> {
  const products = executor.orm.public.CatalogProduct.where({ id });
  const row = await (lock === "update" ? products.forUpdate() : lock === "share" ? products.forShare() : products).first();
  return row === null ? null : toProductRow(row);
}

/** The product with the stem and the regulatory status, or `null` (`product_unique_identity`). */
export async function findProductByIdentity(
  executor: Executor,
  internalCode: string,
  regulatoryStatus: RegulatoryStatus,
): Promise<ProductRow | null> {
  const row = await executor.orm.public.CatalogProduct.where({ internalCode, regulatoryStatus }).first();
  return row === null ? null : toProductRow(row);
}

/** The products with the ids, in the order of the ids. */
export async function findProductsByIds(executor: Executor, ids: readonly bigint[]): Promise<ProductRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.CatalogProduct.where((product) => product.id.in([...ids]))
    .orderBy((product) => product.id.asc())
    .all();
  return rows.map(toProductRow);
}

/**
 * The products in the order of the stem, the status and the id. `active` keeps
 * the active or the inactive products, and `null` keeps all. The product master
 * is small (people enter each product by hand, DEC-041), so the service pages
 * and searches the result in memory: the search reads both names, which sit in
 * one `jsonb` column.
 */
export async function listProductRows(executor: Executor, active: boolean | null): Promise<ProductRow[]> {
  const products = executor.orm.public.CatalogProduct;
  const filtered = active === null ? products.where((product) => product.id.gt(BigInt(0))) : products.where({ isActive: active });
  const rows = await filtered
    .orderBy([
      (product) => product.internalCode.asc(),
      (product) => product.regulatoryStatus.asc(),
      (product) => product.id.asc(),
    ])
    .all();
  return rows.map(toProductRow);
}

/**
 * Inserts a product. A second row with the same stem and status fails with
 * `23505` on `product_unique_identity`.
 */
export async function insertProduct(executor: Executor, product: NewProduct): Promise<ProductRow> {
  const at = toColumnInstant(product.now);
  const row = await executor.orm.public.CatalogProduct.create({
    internalCode: product.internalCode,
    name: product.name,
    description: product.description,
    regulatoryStatus: product.regulatoryStatus,
    kitCodeBase: product.kitCodeBase,
    isActive: true,
    createdAt: at,
    updatedAt: at,
  });
  return toProductRow(row);
}

/** Writes the fields of a change. A new stem and status that another product holds fails with `23505`. */
export async function updateProductRow(executor: Executor, id: bigint, changes: ProductChanges): Promise<void> {
  await executor.orm.public.CatalogProduct.where({ id }).update({
    internalCode: changes.internalCode,
    name: changes.name,
    description: changes.description,
    regulatoryStatus: changes.regulatoryStatus,
    kitCodeBase: changes.kitCodeBase,
    updatedAt: toColumnInstant(changes.now),
  });
}

/** Ends the product for the choice lists. The row stays (DEC-010, CAT-10.AC5). */
export async function markProductInactive(executor: Executor, id: bigint, now: Date): Promise<void> {
  await executor.orm.public.CatalogProduct.where({ id }).update({ isActive: false, updatedAt: toColumnInstant(now) });
}
