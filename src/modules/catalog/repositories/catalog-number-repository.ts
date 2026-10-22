/**
 * The table `catalog_catalog_number` (CAT-20). It holds queries and nothing
 * else. It never decides who may do what, and it never deletes a row: the
 * triggers of the table refuse DELETE and TRUNCATE (DEC-010).
 */
import "server-only";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";
import type { Format } from "@/lib/schemas/catalog";

import { type RowLock, toFormat } from "./stored-values";

export interface CatalogNumberRow {
  readonly id: bigint;
  readonly productId: bigint;
  readonly catalogNumber: string;
  readonly packSize: string | null;
  readonly format: Format | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewCatalogNumber {
  readonly productId: bigint;
  readonly catalogNumber: string;
  readonly packSize: string | null;
  readonly format: Format | null;
  readonly now: Date;
}

/** The fields of a change. Each one is a full value: the service merges the patch (RFC 7396) before it calls. */
export interface CatalogNumberChanges {
  readonly productId: bigint;
  readonly packSize: string | null;
  readonly format: Format | null;
  readonly now: Date;
}

interface StoredCatalogNumber {
  readonly id: bigint;
  readonly productId: bigint;
  readonly catalogNumber: string;
  readonly packSize: string | null;
  readonly format: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toCatalogNumberRow(row: StoredCatalogNumber): CatalogNumberRow {
  return {
    id: row.id,
    productId: row.productId,
    catalogNumber: row.catalogNumber,
    packSize: row.packSize,
    format: toFormat(row.format),
    isActive: row.isActive,
    createdAt: fromColumnInstant(row.createdAt),
    updatedAt: fromColumnInstant(row.updatedAt),
  };
}

/**
 * The catalog number with the id, or `null`. `share` and `update` lock the row:
 * a LOT registration takes `share`, and a move takes `update`, so the two
 * cannot run at once (CAT-20 rule 3). A lock needs a transaction.
 */
export async function findCatalogNumberById(
  executor: Executor,
  id: bigint,
  lock: RowLock = "none",
): Promise<CatalogNumberRow | null> {
  const numbers = executor.orm.public.CatalogCatalogNumber.where({ id });
  const row = await (lock === "update" ? numbers.forUpdate() : lock === "share" ? numbers.forShare() : numbers).first();
  return row === null ? null : toCatalogNumberRow(row);
}

/** The catalog numbers with these exact values, in the order of the ids (CAT-20 rule 2: the match is exact). */
export async function findCatalogNumbersByValues(executor: Executor, values: readonly string[]): Promise<CatalogNumberRow[]> {
  if (values.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.CatalogCatalogNumber.where((number) => number.catalogNumber.in([...values]))
    .orderBy((number) => number.id.asc())
    .all();
  return rows.map(toCatalogNumberRow);
}

/** The catalog numbers of the products, in the order of the ids. */
export async function listCatalogNumbersOfProducts(executor: Executor, productIds: readonly bigint[]): Promise<CatalogNumberRow[]> {
  if (productIds.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.CatalogCatalogNumber.where((number) => number.productId.in([...productIds]))
    .orderBy((number) => number.id.asc())
    .all();
  return rows.map(toCatalogNumberRow);
}

/** The characters that `LIKE` reads as a pattern. The backslash is the escape character of PostgreSQL. */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** The ids of the products that own a catalog number whose value holds the text, case ignored. */
export async function findProductIdsByCatalogNumberContaining(executor: Executor, text: string): Promise<bigint[]> {
  const pattern = `%${escapeLikePattern(text)}%`;
  const rows = await executor.orm.public.CatalogCatalogNumber.where((number) => number.catalogNumber.ilike(pattern))
    .select("productId")
    .all();
  return rows.map((row) => row.productId);
}

/**
 * Inserts a catalog number. A value that exists under any product fails with
 * `23505` on `catalog_number_unique` (CAT-20.AC2).
 */
export async function insertCatalogNumber(executor: Executor, catalogNumber: NewCatalogNumber): Promise<CatalogNumberRow> {
  const at = toColumnInstant(catalogNumber.now);
  const row = await executor.orm.public.CatalogCatalogNumber.create({
    productId: catalogNumber.productId,
    catalogNumber: catalogNumber.catalogNumber,
    packSize: catalogNumber.packSize,
    format: catalogNumber.format,
    isActive: true,
    createdAt: at,
    updatedAt: at,
  });
  return toCatalogNumberRow(row);
}

export async function updateCatalogNumberRow(executor: Executor, id: bigint, changes: CatalogNumberChanges): Promise<void> {
  await executor.orm.public.CatalogCatalogNumber.where({ id }).update({
    productId: changes.productId,
    packSize: changes.packSize,
    format: changes.format,
    updatedAt: toColumnInstant(changes.now),
  });
}

/** Ends the catalog number for the choice lists. The row stays, and a lookup still finds it (DEC-010, CAT-20 rule 4). */
export async function markCatalogNumberInactive(executor: Executor, id: bigint, now: Date): Promise<void> {
  await executor.orm.public.CatalogCatalogNumber.where({ id }).update({ isActive: false, updatedAt: toColumnInstant(now) });
}
