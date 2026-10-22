/**
 * The table `catalog_lot` (CAT-40). It holds queries and nothing else. It never
 * decides who may do what, and it never deletes a row: the triggers of the table
 * refuse DELETE and TRUNCATE (DEC-010).
 *
 * A manufacturing date, a supplied date and an expiry date are business dates
 * (DEC-039): the column carries the text `YYYY-MM-DD`, and this file never turns
 * it into an instant.
 */
import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";
import type { ManufacturingDateSource } from "@/lib/schemas/catalog";

import { type RowLock, toSource } from "./stored-values";

export interface LotRow {
  readonly id: bigint;
  readonly catalogNumberId: bigint;
  readonly lotNumber: string;
  readonly manufacturingDate: string;
  readonly manufacturingDateSource: ManufacturingDateSource;
  readonly suppliedManufacturingDate: string | null;
  readonly expiryDate: string | null;
  readonly hasDateConflict: boolean;
  readonly lotImportId: bigint | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewLot {
  readonly catalogNumberId: bigint;
  readonly lotNumber: string;
  readonly manufacturingDate: string;
  readonly manufacturingDateSource: ManufacturingDateSource;
  readonly suppliedManufacturingDate: string | null;
  readonly expiryDate: string | null;
  readonly hasDateConflict: boolean;
  readonly lotImportId: bigint | null;
  readonly now: Date;
}

interface StoredLot {
  readonly id: bigint;
  readonly catalogNumberId: bigint;
  readonly lotNumber: string;
  readonly manufacturingDate: string;
  readonly manufacturingDateSource: string;
  readonly suppliedManufacturingDate: string | null;
  readonly expiryDate: string | null;
  readonly hasDateConflict: boolean;
  readonly lotImportId: bigint | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toLotRow(row: StoredLot): LotRow {
  return {
    id: row.id,
    catalogNumberId: row.catalogNumberId,
    lotNumber: row.lotNumber,
    manufacturingDate: row.manufacturingDate,
    manufacturingDateSource: toSource(row.manufacturingDateSource),
    suppliedManufacturingDate: row.suppliedManufacturingDate,
    expiryDate: row.expiryDate,
    hasDateConflict: row.hasDateConflict,
    lotImportId: row.lotImportId,
    createdAt: fromColumnInstant(row.createdAt),
    updatedAt: fromColumnInstant(row.updatedAt),
  };
}

/** The LOT with the id, or `null`. `update` locks the row, for a correction. A lock needs a transaction. */
export async function findLotById(executor: Executor, id: bigint, lock: RowLock = "none"): Promise<LotRow | null> {
  const lots = executor.orm.public.CatalogLot.where({ id });
  const row = await (lock === "update" ? lots.forUpdate() : lock === "share" ? lots.forShare() : lots).first();
  return row === null ? null : toLotRow(row);
}

/** The LOTs with the ids, in the order of the ids. */
export async function findLotsByIds(executor: Executor, ids: readonly bigint[]): Promise<LotRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.CatalogLot.where((lot) => lot.id.in([...ids]))
    .orderBy((lot) => lot.id.asc())
    .all();
  return rows.map(toLotRow);
}

/** The LOT of a catalog number with the LOT number, or `null` (`lot_unique_per_catalog_number`). */
export async function findLotByNumber(executor: Executor, catalogNumberId: bigint, lotNumber: string): Promise<LotRow | null> {
  const row = await executor.orm.public.CatalogLot.where({ catalogNumberId, lotNumber }).first();
  return row === null ? null : toLotRow(row);
}

/**
 * The registered LOTs of the catalog numbers with one of the LOT numbers. The
 * planner of an import reads them for its rows (CAT-60 rule 6).
 */
export async function findLotsOfCatalogNumbers(
  executor: Executor,
  catalogNumberIds: readonly bigint[],
  lotNumbers: readonly string[],
): Promise<LotRow[]> {
  if (catalogNumberIds.length === 0 || lotNumbers.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.CatalogLot.where((lot) =>
    and(lot.catalogNumberId.in([...catalogNumberIds]), lot.lotNumber.in([...lotNumbers])),
  ).all();
  return rows.map(toLotRow);
}

/**
 * Inserts a LOT. A second LOT with the same number under the catalog number
 * fails with `23505` on `lot_unique_per_catalog_number` (CAT-40.AC2).
 */
export async function insertLot(executor: Executor, lot: NewLot): Promise<LotRow> {
  const [row] = await insertLots(executor, [lot]);
  if (row === undefined) {
    throw new Error("The store did not return the LOT that it inserted");
  }
  return row;
}

/** The most LOTs of one `INSERT`. A statement holds 65,535 parameters at most. */
const INSERT_CHUNK = 500;

/** Inserts LOTs, in chunks, and returns them in the order of the input. */
export async function insertLots(executor: Executor, lots: readonly NewLot[]): Promise<LotRow[]> {
  const inserted: LotRow[] = [];
  for (let start = 0; start < lots.length; start += INSERT_CHUNK) {
    const chunk = lots.slice(start, start + INSERT_CHUNK);
    const rows = await executor.orm.public.CatalogLot.createAll(
      chunk.map((lot) => {
        const at = toColumnInstant(lot.now);
        return {
          catalogNumberId: lot.catalogNumberId,
          lotNumber: lot.lotNumber,
          manufacturingDate: lot.manufacturingDate,
          manufacturingDateSource: lot.manufacturingDateSource,
          suppliedManufacturingDate: lot.suppliedManufacturingDate,
          expiryDate: lot.expiryDate,
          hasDateConflict: lot.hasDateConflict,
          lotImportId: lot.lotImportId,
          createdAt: at,
          updatedAt: at,
        };
      }),
    );
    // The statement does not promise the order of `RETURNING`: put each row back by its key.
    const byKey = new Map(rows.map((row) => [`${String(row.catalogNumberId)}\u0000${row.lotNumber}`, toLotRow(row)]));
    for (const lot of chunk) {
      const row = byKey.get(`${String(lot.catalogNumberId)}\u0000${lot.lotNumber}`);
      if (row === undefined) {
        throw new Error("The store did not return a LOT that it inserted");
      }
      inserted.push(row);
    }
  }
  return inserted;
}

/** Writes the corrected manufacturing date (CAT-41.AC1): the source `MANUAL_CORRECTION` and no date conflict. */
export async function updateLotManufacturingDate(executor: Executor, id: bigint, manufacturingDate: string, now: Date): Promise<void> {
  await executor.orm.public.CatalogLot.where({ id }).update({
    manufacturingDate,
    manufacturingDateSource: "MANUAL_CORRECTION",
    hasDateConflict: false,
    updatedAt: toColumnInstant(now),
  });
}

/** The number of LOTs of each catalog number. A catalog number with no LOT has no entry. */
export async function countLotsByCatalogNumber(executor: Executor, catalogNumberIds: readonly bigint[]): Promise<Map<bigint, number>> {
  if (catalogNumberIds.length === 0) {
    return new Map();
  }
  const rows = await executor.orm.public.CatalogLot.where((lot) => lot.catalogNumberId.in([...catalogNumberIds]))
    .groupBy("catalogNumberId")
    .aggregate((aggregate) => ({ total: aggregate.count() }));
  return new Map(rows.map((row) => [row.catalogNumberId, row.total]));
}

/** The number of LOTs under the catalog numbers. */
export async function countLotsOfCatalogNumbers(executor: Executor, catalogNumberIds: readonly bigint[]): Promise<number> {
  if (catalogNumberIds.length === 0) {
    return 0;
  }
  const totals = await executor.orm.public.CatalogLot.where((lot) => lot.catalogNumberId.in([...catalogNumberIds])).aggregate(
    (aggregate) => ({ total: aggregate.count() }),
  );
  return totals.total;
}

export interface LotPageQuery {
  /** The catalog numbers of the product. A page lists their LOTs. */
  readonly catalogNumberIds: readonly bigint[];
  /** `true` for the LOTs with a date conflict, `false` for the others, `null` for all. */
  readonly conflict: boolean | null;
  readonly page: number;
  readonly limit: number;
}

export interface LotPage {
  readonly rows: readonly LotRow[];
  readonly totalCount: number;
}

/** One page of LOTs, newest first. The order is total, so two pages never swap rows. */
export async function listLotRows(executor: Executor, query: LotPageQuery): Promise<LotPage> {
  if (query.catalogNumberIds.length === 0) {
    return { rows: [], totalCount: 0 };
  }
  const matching = executor.orm.public.CatalogLot.where((lot) =>
    query.conflict === null
      ? lot.catalogNumberId.in([...query.catalogNumberIds])
      : and(lot.catalogNumberId.in([...query.catalogNumberIds]), lot.hasDateConflict.eq(query.conflict)),
  );
  const [totals, rows] = await Promise.all([
    matching.aggregate((aggregate) => ({ total: aggregate.count() })),
    matching
      .orderBy((lot) => lot.id.desc())
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .all(),
  ]);
  return { rows: rows.map(toLotRow), totalCount: totals.total };
}
