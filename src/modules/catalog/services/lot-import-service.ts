/**
 * The LOT import (CAT-60, CAT-61).
 *
 * A preview reads the input and answers the plan, and writes nothing. A commit
 * reads the same input, plans each row again, and writes only the `CREATED`
 * rows, with one import and one audit row (CAT-60 rule 1, rule 11). The reading
 * and the planning are the pure functions of `../domain/`. Each function checks
 * the permission of the actor first (DEC-029).
 *
 * MOCK: CAT-60, CAT-61. The functions read and write the mock store. Step 4 moves
 * the work to the repositories. The commit then runs in one transaction. A stop
 * rolls it back, and a second transaction records the import as `FAILED` with
 * the code of the error (CAT-60 rule 8). The template is built with `exceljs`
 * (DEC-055).
 */
import "server-only";

import { createHash } from "node:crypto";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, NotImplemented } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import type { Language } from "@/lib/i18n/languages";
import { type MockLotImport, type MockLotImportRow, getCatalogMock } from "@/lib/mock/catalog";
import type {
  ImportCounts,
  ImportListQuery,
  ImportPlan,
  ImportPlanGroup,
  ImportRowListQuery,
  LotImportInput,
  LotImportListPage,
  LotImportRowListPage,
  LotImportView,
} from "@/lib/schemas/catalog";

import { readImportRows } from "../domain/import-reader";
import { type PlannedRow, type PlannerContext, countOutcomes, planRows } from "../domain/import-planner";
import { recordAudit } from "./catalog-audit";
import {
  byIdAscending,
  byIdDescending,
  notFound,
  pageOf,
  toLotImportRowView,
  toLotImportView,
} from "./catalog-views";
import { findLotByNumber, insertLot, rollbackLots } from "./lot-store";

/** The longest file name that an import keeps. The name is metadata only: it never reaches a path (`sds-nextjs-backend` §3). */
const FILENAME_MAX = 255;

/** The SHA-256 of the input, in lowercase hexadecimal (CAT-60 rule 9). */
function hashOf(input: LotImportInput): string {
  const hash = createHash("sha256");
  hash.update(input.source.kind === "text" ? Buffer.from(input.source.text, "utf8") : input.source.bytes);
  return hash.digest("hex");
}

/** The file name without its directory, without control characters, at most 255 characters. `null` for pasted text. */
function filenameOf(input: LotImportInput): string | null {
  if (input.source.kind === "text" || input.source.filename === null) {
    return null;
  }
  const lastSegment = input.source.filename.split(/[\\/]/).pop() ?? "";
  const printable = Array.from(lastSegment).filter((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127;
  });
  const cleaned = printable.join("").trim().slice(0, FILENAME_MAX);
  return cleaned === "" ? null : cleaned;
}

/**
 * The planner context on the mock store: the catalog numbers by their exact
 * value, and the registered LOTs.
 */
function plannerContext(productId: string | null): PlannerContext {
  // MOCK: CAT-60 (the registered data)
  const state = getCatalogMock();
  return {
    productId,
    findCatalogNumber: (value) => {
      const row = [...state.catalogNumbers.values()].find((candidate) => candidate.catalogNumber === value);
      const product = row === undefined ? undefined : state.products.get(row.productId);
      return row === undefined || product === undefined
        ? null
        : { id: row.id, productId: row.productId, kitCodeBase: product.kitCodeBase, format: row.format };
    },
    findRegisteredLotDate: (catalogNumberId, lotNumber) => findLotByNumber(catalogNumberId, lotNumber)?.manufacturingDate ?? null,
  };
}

interface PlannedInput {
  readonly planned: readonly PlannedRow[];
  readonly hash: string;
}

/**
 * Reads the input and plans the rows.
 *
 * @throws AppError `VAL-4006` when `productId` names no product, and the faults of the reader.
 */
function planInput(input: LotImportInput): PlannedInput {
  if (input.productId !== null && !getCatalogMock().products.has(input.productId)) {
    throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: "is not a product" } }]);
  }
  const rows = readImportRows(input);
  return { planned: planRows(rows, plannerContext(input.productId)), hash: hashOf(input) };
}

/** The plan grouped by product, the products in the order of the ids and the rows with no product last. */
function groupByProduct(planned: readonly PlannedRow[]): ImportPlanGroup[] {
  const state = getCatalogMock();
  const keyed = new Map<string | null, ImportPlanGroup["rows"][number][]>();
  for (const entry of planned) {
    const productId = entry.catalogNumber?.productId ?? null;
    keyed.set(productId, [
      ...(keyed.get(productId) ?? []),
      {
        rowNumber: entry.row.rowNumber,
        rawCells: entry.row.rawCells,
        catalogNumberId: entry.catalogNumber?.id ?? null,
        lotNumber: entry.lotNumber,
        manufacturingDate: entry.manufacturingDate,
        outcome: entry.outcome,
        reason: entry.reason,
      },
    ]);
  }
  const ids = [...keyed.keys()];
  const known = ids.filter((id): id is string => id !== null).sort((left, right) => Number(left) - Number(right));
  return [...known, ...(keyed.has(null) ? [null] : [])].map((productId) => {
    const product = productId === null ? undefined : state.products.get(productId);
    return {
      productId,
      internalCode: product?.internalCode ?? null,
      regulatoryStatus: product?.regulatoryStatus ?? null,
      rows: keyed.get(productId) ?? [],
    };
  });
}

/**
 * Reads the input and answers the plan: each row with its outcome and reason,
 * grouped by product, the counts, and the earlier import with the same hash
 * (CAT-60 rule 1, rule 9). It writes nothing.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.manage`; `VAL-4006` for each
 * fault of the input (CAT-60 rule 12, AC10, AC19, AC20).
 */
export async function previewImport(actor: SessionActor, input: LotImportInput): Promise<ImportPlan> {
  requirePermission(actor, "catalog.lot.manage");
  // MOCK: CAT-60 (preview)
  const { planned, hash } = planInput(input);
  const sameHash = [...getCatalogMock().imports.values()]
    .filter((candidate) => candidate.sourceHash === hash && candidate.status === "COMPLETED")
    .sort(byIdDescending)[0];
  return Promise.resolve({
    rowCount: planned.length,
    counts: countOutcomes(planned),
    groups: groupByProduct(planned),
    sourceHash: hash,
    sameHashImportId: sameHash?.id ?? null,
  });
}

/**
 * Commits an import: it plans each row again, writes the LOT of each `CREATED`
 * row, and ends the import `COMPLETED` (CAT-60 rule 8). A stop rolls the LOTs
 * back and records the import as `FAILED` with the code of the error (AC14).
 * The commit has one audit row with the counts (CAT-60 rule 11).
 *
 * @throws AppError `PERM-4150` without `catalog.lot.manage`; `VAL-4006` for each
 * fault of the input, and no import is recorded for it.
 */
export async function commitImport(actor: SessionActor, input: LotImportInput): Promise<LotImportView> {
  requirePermission(actor, "catalog.lot.manage");
  // MOCK: CAT-60 (commit)
  const state = getCatalogMock();
  const { planned, hash } = planInput(input);
  const counts: ImportCounts = countOutcomes(planned);
  const started = now();
  const importId = String(state.nextImportId);
  state.nextImportId += 1;

  const createdLotIds: string[] = [];
  try {
    const rows: MockLotImportRow[] = [];
    for (const entry of planned) {
      let lotId: string | null = null;
      if (entry.outcome === "CREATED" && entry.catalogNumber !== null && entry.lotNumber !== null && entry.manufacturingDate !== null) {
        const catalogNumber = state.catalogNumbers.get(entry.catalogNumber.id);
        if (catalogNumber === undefined) {
          throw notFound();
        }
        const lot = insertLot(catalogNumber, {
          lotNumber: entry.lotNumber,
          manufacturingDate: entry.manufacturingDate,
          source: entry.suppliedDate === null ? "PARSED_FROM_LOT" : "SUPPLIED",
          suppliedManufacturingDate: entry.suppliedDate,
          expiryDate: null,
          hasDateConflict: false,
          lotImportId: importId,
        });
        createdLotIds.push(lot.id);
        lotId = lot.id;
      }
      rows.push({
        id: String(state.nextImportRowId + rows.length),
        lotImportId: importId,
        rowNumber: entry.row.rowNumber,
        outcome: entry.outcome,
        reason: entry.reason,
        rawCells: entry.row.rawCells,
        lotId,
      });
    }
    state.nextImportRowId += rows.length;
    state.importRows.push(...rows);
    const completed: MockLotImport = {
      id: importId,
      sourceFilename: filenameOf(input),
      sourceHash: hash,
      productId: input.productId,
      uploadedByUserId: actor.userId,
      status: "COMPLETED",
      rowCount: planned.length,
      createdCount: counts.created,
      existingCount: counts.existing,
      conflictCount: counts.conflict,
      invalidCount: counts.invalid,
      failureCode: null,
      createdAt: started,
      completedAt: now(),
    };
    state.imports.set(importId, completed);
    recordAudit(actor, {
      actionCode: "catalog.lot_import.committed",
      entityType: "catalog_lot_import",
      entityId: importId,
      stateBefore: null,
      stateAfter: { productId: input.productId, rowCount: planned.length, ...counts, sourceHash: hash },
    });
    return toLotImportView(completed);
  } catch (error) {
    // The rollback of the commit transaction, then the second transaction that records the stop (CAT-60 rule 8).
    rollbackLots(createdLotIds);
    state.imports.set(importId, {
      id: importId,
      sourceFilename: filenameOf(input),
      sourceHash: hash,
      productId: input.productId,
      uploadedByUserId: actor.userId,
      status: "FAILED",
      rowCount: 0,
      createdCount: 0,
      existingCount: 0,
      conflictCount: 0,
      invalidCount: 0,
      failureCode: error instanceof AppError ? error.code : "SYS-5000",
      createdAt: started,
      completedAt: now(),
    });
    throw error;
  }
}

/**
 * Lists the imports, newest first (DEC-056).
 *
 * @throws AppError `PERM-4150` without `catalog.lot.view`.
 */
export async function listImports(actor: SessionActor, query: ImportListQuery): Promise<LotImportListPage> {
  requirePermission(actor, "catalog.lot.view");
  // MOCK: CAT-60 (list)
  const { slice, totalCount } = pageOf([...getCatalogMock().imports.values()].sort(byIdDescending), query);
  const imports = slice.map(toLotImportView);
  return Promise.resolve({ page: query.page, count: imports.length, totalCount, imports, filterParams: query });
}

/**
 * One import with its counts.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.view`; `RES-4200`.
 */
export async function getImport(actor: SessionActor, id: string): Promise<LotImportView> {
  requirePermission(actor, "catalog.lot.view");
  // MOCK: CAT-60 (read)
  const found = getCatalogMock().imports.get(id);
  if (found === undefined) {
    throw notFound();
  }
  return Promise.resolve(toLotImportView(found));
}

/**
 * The rows of an import, in the order of the source, one page.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.view`; `RES-4200`.
 */
export async function listImportRows(actor: SessionActor, id: string, query: ImportRowListQuery): Promise<LotImportRowListPage> {
  requirePermission(actor, "catalog.lot.view");
  // MOCK: CAT-60 (rows)
  const state = getCatalogMock();
  if (!state.imports.has(id)) {
    throw notFound();
  }
  const matching = state.importRows
    .filter((row) => row.lotImportId === id)
    .filter((row) => query.outcome === null || row.outcome === query.outcome)
    .sort((left, right) => left.rowNumber - right.rowNumber || byIdAscending(left, right));
  const { slice, totalCount } = pageOf(matching, query);
  const rows = slice.map(toLotImportRowView);
  return Promise.resolve({ page: query.page, count: rows.length, totalCount, rows, filterParams: query });
}

/**
 * The import template: an XLSX file with the header row in the active language
 * on the first sheet and the instructions on the second (CAT-61.AC1).
 *
 * @throws AppError `PERM-4150` without `catalog.lot.manage` (DEC-057).
 * @throws NotImplemented until step 4 builds the file with `exceljs` (DEC-055).
 */
export async function importTemplate(actor: SessionActor, language: Language): Promise<Uint8Array<ArrayBuffer>> {
  requirePermission(actor, "catalog.lot.manage");
  // MOCK: CAT-61
  void language;
  return Promise.reject(new NotImplemented("catalog.lot_import.template"));
}
