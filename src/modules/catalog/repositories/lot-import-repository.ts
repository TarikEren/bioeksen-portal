/**
 * The tables `catalog_lot_import` and `catalog_lot_import_row` (CAT-60). It
 * holds queries and nothing else. It never decides who may do what, and it never
 * deletes a row: the triggers of both tables refuse DELETE and TRUNCATE
 * (DEC-010).
 *
 * `uploaded_by_user_id` holds the id of a user and has no foreign key: the
 * module reads the data of `identity` only through its service (DEC-004).
 */
import "server-only";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";
import type { ImportCounts, ImportStatus, Outcome, Reason } from "@/lib/schemas/catalog";

import { toImportStatus, toOutcome, toReason, toStoredCells } from "./stored-values";

export interface LotImportRecord {
  readonly id: bigint;
  readonly sourceFilename: string | null;
  readonly sourceHash: string;
  readonly productId: bigint | null;
  readonly uploadedByUserId: bigint;
  readonly status: ImportStatus;
  readonly rowCount: number;
  readonly createdCount: number;
  readonly existingCount: number;
  readonly conflictCount: number;
  readonly invalidCount: number;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface LotImportRowRecord {
  readonly id: bigint;
  readonly lotImportId: bigint;
  readonly rowNumber: number;
  readonly outcome: Outcome;
  readonly reason: Reason | null;
  readonly rawCells: { readonly catalogNumber?: string; readonly lotNumber?: string; readonly manufacturingDate?: string };
  readonly lotId: bigint | null;
}

interface StoredImport {
  readonly id: bigint;
  readonly sourceFilename: string | null;
  readonly sourceHash: string;
  readonly productId: bigint | null;
  readonly uploadedByUserId: bigint;
  readonly status: string;
  readonly rowCount: number;
  readonly createdCount: number;
  readonly existingCount: number;
  readonly conflictCount: number;
  readonly invalidCount: number;
  readonly failureCode: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

function toImportRecord(row: StoredImport): LotImportRecord {
  return {
    id: row.id,
    sourceFilename: row.sourceFilename,
    sourceHash: row.sourceHash,
    productId: row.productId,
    uploadedByUserId: row.uploadedByUserId,
    status: toImportStatus(row.status),
    rowCount: row.rowCount,
    createdCount: row.createdCount,
    existingCount: row.existingCount,
    conflictCount: row.conflictCount,
    invalidCount: row.invalidCount,
    failureCode: row.failureCode,
    createdAt: fromColumnInstant(row.createdAt),
    completedAt: row.completedAt === null ? null : fromColumnInstant(row.completedAt),
  };
}

export interface NewImport {
  readonly sourceFilename: string | null;
  readonly sourceHash: string;
  readonly productId: bigint | null;
  readonly uploadedByUserId: bigint;
  readonly rowCount: number;
  readonly now: Date;
}

/** Inserts an import with the status `PROCESSING` and no count (CAT-60 rule 8). */
export async function insertProcessingImport(executor: Executor, record: NewImport): Promise<LotImportRecord> {
  const row = await executor.orm.public.CatalogLotImport.create({
    sourceFilename: record.sourceFilename,
    sourceHash: record.sourceHash,
    productId: record.productId,
    uploadedByUserId: record.uploadedByUserId,
    status: "PROCESSING",
    rowCount: record.rowCount,
    createdCount: 0,
    existingCount: 0,
    conflictCount: 0,
    invalidCount: 0,
    failureCode: null,
    createdAt: toColumnInstant(record.now),
    completedAt: null,
  });
  return toImportRecord(row);
}

/**
 * Ends the import `COMPLETED` with its counts. The four counts add up to the row
 * count, or `lot_import_counts_add_up` refuses the write.
 */
export async function markImportCompleted(executor: Executor, id: bigint, counts: ImportCounts, now: Date): Promise<void> {
  await executor.orm.public.CatalogLotImport.where({ id }).update({
    status: "COMPLETED",
    createdCount: counts.created,
    existingCount: counts.existing,
    conflictCount: counts.conflict,
    invalidCount: counts.invalid,
    completedAt: toColumnInstant(now),
  });
}

export interface NewFailedImport {
  readonly sourceFilename: string | null;
  readonly sourceHash: string;
  readonly productId: bigint | null;
  readonly uploadedByUserId: bigint;
  readonly failureCode: string;
  readonly startedAt: Date;
  readonly now: Date;
}

/**
 * Inserts an import that stopped, with the code of the error (CAT-60 rule 8,
 * AC14). The commit transaction rolled back, so the `PROCESSING` row is gone and
 * this is the only row of the import. No count and no row of the report remain.
 */
export async function insertFailedImport(executor: Executor, record: NewFailedImport): Promise<LotImportRecord> {
  const row = await executor.orm.public.CatalogLotImport.create({
    sourceFilename: record.sourceFilename,
    sourceHash: record.sourceHash,
    productId: record.productId,
    uploadedByUserId: record.uploadedByUserId,
    status: "FAILED",
    rowCount: 0,
    createdCount: 0,
    existingCount: 0,
    conflictCount: 0,
    invalidCount: 0,
    failureCode: record.failureCode,
    createdAt: toColumnInstant(record.startedAt),
    completedAt: toColumnInstant(record.now),
  });
  return toImportRecord(row);
}

export interface NewImportRow {
  readonly lotImportId: bigint;
  readonly rowNumber: number;
  readonly outcome: Outcome;
  readonly reason: Reason | null;
  readonly rawCells: { readonly catalogNumber?: string; readonly lotNumber?: string; readonly manufacturingDate?: string };
  readonly lotId: bigint | null;
}

/** The most rows of one `INSERT`. A statement holds 65,535 parameters at most. */
const INSERT_CHUNK = 1000;

/** Inserts the rows of the report. The rows of one import have each their own number (`lot_import_row_unique`). */
export async function insertImportRows(executor: Executor, rows: readonly NewImportRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    await executor.orm.public.CatalogLotImportRow.createAndCount(
      rows.slice(start, start + INSERT_CHUNK).map((row) => ({
        lotImportId: row.lotImportId,
        rowNumber: row.rowNumber,
        outcome: row.outcome,
        reason: row.reason,
        rawCells: row.rawCells,
        lotId: row.lotId,
      })),
    );
  }
}

export async function findImportById(executor: Executor, id: bigint): Promise<LotImportRecord | null> {
  const row = await executor.orm.public.CatalogLotImport.where({ id }).first();
  return row === null ? null : toImportRecord(row);
}

/** The id of the latest import with this hash that ended `COMPLETED`, or `null` (CAT-60 rule 9). */
export async function findLatestCompletedImportIdByHash(executor: Executor, sourceHash: string): Promise<bigint | null> {
  const row = await executor.orm.public.CatalogLotImport.where({ sourceHash, status: "COMPLETED" })
    .orderBy((record) => record.id.desc())
    .select("id")
    .first();
  return row === null ? null : row.id;
}

export interface Paging {
  readonly page: number;
  readonly limit: number;
}

export interface ImportPage {
  readonly rows: readonly LotImportRecord[];
  readonly totalCount: number;
}

/** One page of imports, newest first (DEC-056). */
export async function listImportRecords(executor: Executor, paging: Paging): Promise<ImportPage> {
  const imports = executor.orm.public.CatalogLotImport.where((record) => record.id.gt(BigInt(0)));
  const [totals, rows] = await Promise.all([
    imports.aggregate((aggregate) => ({ total: aggregate.count() })),
    imports
      .orderBy((record) => record.id.desc())
      .offset((paging.page - 1) * paging.limit)
      .limit(paging.limit)
      .all(),
  ]);
  return { rows: rows.map(toImportRecord), totalCount: totals.total };
}

export interface ImportRowPage {
  readonly rows: readonly LotImportRowRecord[];
  readonly totalCount: number;
}

/** One page of the rows of an import, in the order of the source. `outcome` keeps one outcome, `null` keeps all. */
export async function listImportRowRecords(
  executor: Executor,
  lotImportId: bigint,
  outcome: Outcome | null,
  paging: Paging,
): Promise<ImportRowPage> {
  const rows = executor.orm.public.CatalogLotImportRow.where(outcome === null ? { lotImportId } : { lotImportId, outcome });
  const [totals, page] = await Promise.all([
    rows.aggregate((aggregate) => ({ total: aggregate.count() })),
    rows
      .orderBy([(row) => row.rowNumber.asc(), (row) => row.id.asc()])
      .offset((paging.page - 1) * paging.limit)
      .limit(paging.limit)
      .all(),
  ]);
  return {
    rows: page.map((row) => ({
      id: row.id,
      lotImportId: row.lotImportId,
      rowNumber: row.rowNumber,
      outcome: toOutcome(row.outcome),
      reason: toReason(row.reason),
      rawCells: toStoredCells(row.rawCells),
      lotId: row.lotId,
    })),
    totalCount: totals.total,
  };
}
