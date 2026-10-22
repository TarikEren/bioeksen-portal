/**
 * The LOT import (CAT-60, CAT-61).
 *
 * A preview reads the input and answers the plan, and writes nothing. A commit
 * reads the same input, plans each row again inside its transaction, and writes
 * only the `CREATED` rows, with one import and one audit row (CAT-60 rule 1,
 * rule 11). The reading and the planning are the functions of `../domain/`. Each
 * function checks the permission of the actor first (DEC-029).
 *
 * The commit runs in one transaction: the import is created as `PROCESSING` and
 * ends as `COMPLETED` in it. If the commit stops with an error, the transaction
 * rolls back, and a second transaction records the import as `FAILED` with the
 * code of the error (CAT-60 rule 8, AC14).
 */
import "server-only";

import { createHash } from "node:crypto";

import ExcelJS from "exceljs";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Language } from "@/lib/i18n/languages";
import { logger } from "@/lib/logging";
import { type Executor, readExecutor, runTransaction } from "@/lib/transaction";
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

import { type ImportRow, readImportRows } from "../domain/import-reader";
import { type PlannedRow, type PlannerContext, countOutcomes, planRows } from "../domain/import-planner";
import { cleanTransport } from "../domain/lot-number";
import { findCatalogNumbersByValues } from "../repositories/catalog-number-repository";
import {
  findImportById,
  findLatestCompletedImportIdByHash,
  insertFailedImport,
  insertImportRows,
  insertProcessingImport,
  listImportRecords,
  listImportRowRecords,
  markImportCompleted,
} from "../repositories/lot-import-repository";
import { findLotsOfCatalogNumbers, insertLots } from "../repositories/lot-repository";
import { type ProductRow, findProductById, findProductsByIds } from "../repositories/product-repository";
import { recordAudit } from "./catalog-audit";
import { notFound, parseCatalogId, requireCatalogId, toLotImportRowView, toLotImportView } from "./catalog-views";

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

function unique<TValue>(values: readonly TValue[]): TValue[] {
  return [...new Set(values)];
}

/** The key of a LOT in the registered data: the catalog number and the LOT number. */
function lotKey(catalogNumberId: bigint | string, lotNumber: string): string {
  return `${String(catalogNumberId)}\u0000${lotNumber}`;
}

/** The registered data that the planner reads, and the products of the rows for the report. */
interface PlanningData {
  readonly context: PlannerContext;
  readonly products: ReadonlyMap<string, ProductRow>;
}

/**
 * Reads the registered data that the rows need: their catalog numbers by the
 * exact (cleaned) value, the products of those, and the LOTs that the rows
 * name. It reads through `executor`: the commit passes its transaction, so the
 * plan sees what is registered at the commit (CAT-60.AC12, AC13).
 */
async function loadPlanningData(executor: Executor, rows: readonly ImportRow[], productId: bigint | null): Promise<PlanningData> {
  const catalogValues = unique(
    rows.map((row) => (row.catalogNumberCell === null ? "" : cleanTransport(row.catalogNumberCell))).filter((value) => value !== ""),
  );
  const catalogNumbers = await findCatalogNumbersByValues(executor, catalogValues);
  const productRows = await findProductsByIds(
    executor,
    unique(catalogNumbers.map((row) => row.productId)),
  );
  const products = new Map(productRows.map((row) => [String(row.id), row]));
  const lotValues = unique(rows.map((row) => cleanTransport(row.lotCell)).filter((value) => value !== ""));
  const registered = await findLotsOfCatalogNumbers(
    executor,
    catalogNumbers.map((row) => row.id),
    lotValues,
  );
  const registeredDates = new Map(registered.map((lot) => [lotKey(lot.catalogNumberId, lot.lotNumber), lot.manufacturingDate]));
  const byValue = new Map(catalogNumbers.map((row) => [row.catalogNumber, row]));

  const context: PlannerContext = {
    productId: productId === null ? null : String(productId),
    findCatalogNumber: (value) => {
      const row = byValue.get(value);
      const product = row === undefined ? undefined : products.get(String(row.productId));
      return row === undefined || product === undefined
        ? null
        : { id: String(row.id), productId: String(row.productId), kitCodeBase: product.kitCodeBase, format: row.format };
    },
    findRegisteredLotDate: (catalogNumberId, lotNumber) => registeredDates.get(lotKey(catalogNumberId, lotNumber)) ?? null,
  };
  return { context, products };
}

interface PlannedInput {
  readonly planned: readonly PlannedRow[];
  readonly products: ReadonlyMap<string, ProductRow>;
}

/** The key of the product of an import for one product, or `null` for all products. @throws AppError `VAL-4006` for a key of a wrong form. */
function productKeyOf(input: LotImportInput): bigint | null {
  if (input.productId === null) {
    return null;
  }
  const key = parseCatalogId(input.productId);
  if (key === null) {
    throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: "is not a product" } }]);
  }
  return key;
}

/**
 * Plans the rows against the registered data that `executor` reads.
 *
 * @throws AppError `VAL-4006` when `productId` names no product.
 */
async function planOn(executor: Executor, rows: readonly ImportRow[], productKey: bigint | null): Promise<PlannedInput> {
  if (productKey !== null && (await findProductById(executor, productKey)) === null) {
    throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: "is not a product" } }]);
  }
  const { context, products } = await loadPlanningData(executor, rows, productKey);
  return { planned: planRows(rows, context), products };
}

/** The plan grouped by product, the products in the order of the ids and the rows with no product last. */
function groupByProduct(planned: readonly PlannedRow[], products: ReadonlyMap<string, ProductRow>): ImportPlanGroup[] {
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
  const known = [...keyed.keys()].filter((id): id is string => id !== null).sort((left, right) => Number(left) - Number(right));
  return [...known, ...(keyed.has(null) ? [null] : [])].map((productId) => {
    const product = productId === null ? undefined : products.get(productId);
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
  const executor = readExecutor();
  const productKey = productKeyOf(input);
  const rows = await readImportRows(input);
  const { planned, products } = await planOn(executor, rows, productKey);
  const hash = hashOf(input);
  const sameHash = await findLatestCompletedImportIdByHash(executor, hash);
  return {
    rowCount: planned.length,
    counts: countOutcomes(planned),
    groups: groupByProduct(planned, products),
    sourceHash: hash,
    sameHashImportId: sameHash === null ? null : String(sameHash),
  };
}

/** What a commit needs to record a stop, once the input is read. */
interface CommitFrame {
  readonly sourceFilename: string | null;
  readonly sourceHash: string;
  readonly productId: bigint | null;
  readonly uploadedByUserId: bigint;
  readonly startedAt: Date;
}

/**
 * Records the import as `FAILED` in a second transaction (CAT-60 rule 8, AC14).
 * A failure of this write is logged and never replaces the error of the commit,
 * which the caller throws.
 */
async function recordStop(frame: CommitFrame, error: unknown): Promise<void> {
  const failureCode = error instanceof AppError ? error.code : "SYS-5000";
  try {
    await runTransaction((tx) => insertFailedImport(tx, { ...frame, failureCode, now: now() }));
  } catch (secondary) {
    logger.failure(secondary instanceof AppError ? secondary.code : "SYS-5000", {
      tail: { step: "record the failed LOT import", failureCode },
      error: secondary,
    });
  }
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
  const productKey = productKeyOf(input);
  // A fault of the input stops here: the commit has not started, and no import is recorded (AC10).
  const rows = await readImportRows(input);
  const frame: CommitFrame = {
    sourceFilename: filenameOf(input),
    sourceHash: hashOf(input),
    productId: productKey,
    uploadedByUserId: BigInt(actor.userId),
    startedAt: now(),
  };
  try {
    return await runTransaction(async (tx) => {
      const { planned } = await planOn(tx, rows, productKey);
      const counts: ImportCounts = countOutcomes(planned);
      const processing = await insertProcessingImport(tx, {
        sourceFilename: frame.sourceFilename,
        sourceHash: frame.sourceHash,
        productId: frame.productId,
        uploadedByUserId: frame.uploadedByUserId,
        rowCount: planned.length,
        now: frame.startedAt,
      });

      // Only a `CREATED` row writes a LOT (CAT-60 rule 7).
      const created = planned.flatMap((entry) =>
        entry.outcome === "CREATED" && entry.catalogNumber !== null && entry.lotNumber !== null && entry.manufacturingDate !== null
          ? [{ entry, catalogNumberId: BigInt(entry.catalogNumber.id), lotNumber: entry.lotNumber, manufacturingDate: entry.manufacturingDate }]
          : [],
      );
      const lots = await insertLots(
        tx,
        created.map(({ entry, catalogNumberId, lotNumber, manufacturingDate }) => ({
          catalogNumberId,
          lotNumber,
          manufacturingDate,
          manufacturingDateSource: entry.suppliedDate === null ? "PARSED_FROM_LOT" : "SUPPLIED",
          suppliedManufacturingDate: entry.suppliedDate,
          expiryDate: null,
          hasDateConflict: false,
          lotImportId: processing.id,
          now: frame.startedAt,
        })),
      );
      const lotIdOfRow = new Map(created.map((item, index) => [item.entry.row.rowNumber, lots[index]?.id ?? null]));

      await insertImportRows(
        tx,
        planned.map((entry) => ({
          lotImportId: processing.id,
          rowNumber: entry.row.rowNumber,
          outcome: entry.outcome,
          reason: entry.reason,
          rawCells: entry.row.rawCells,
          lotId: lotIdOfRow.get(entry.row.rowNumber) ?? null,
        })),
      );

      const completedAt = now();
      await markImportCompleted(tx, processing.id, counts, completedAt);
      await recordAudit(tx, actor, {
        actionCode: "catalog.lot_import.committed",
        entityType: "catalog_lot_import",
        entityId: String(processing.id),
        stateBefore: null,
        stateAfter: {
          productId: frame.productId === null ? null : String(frame.productId),
          rowCount: planned.length,
          createdCount: counts.created,
          existingCount: counts.existing,
          conflictCount: counts.conflict,
          invalidCount: counts.invalid,
          sourceHash: frame.sourceHash,
        },
      });
      return toLotImportView({
        ...processing,
        status: "COMPLETED",
        createdCount: counts.created,
        existingCount: counts.existing,
        conflictCount: counts.conflict,
        invalidCount: counts.invalid,
        completedAt,
      });
    });
  } catch (error) {
    // The transaction rolled back: no LOT of this commit exists. Then the second transaction records the stop.
    await recordStop(frame, error);
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
  const page = await listImportRecords(readExecutor(), query);
  const imports = page.rows.map(toLotImportView);
  return { page: query.page, count: imports.length, totalCount: page.totalCount, imports, filterParams: query };
}

/**
 * One import with its counts.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.view`; `RES-4200`.
 */
export async function getImport(actor: SessionActor, id: string): Promise<LotImportView> {
  requirePermission(actor, "catalog.lot.view");
  const found = await findImportById(readExecutor(), requireCatalogId(id));
  if (found === null) {
    throw notFound();
  }
  return toLotImportView(found);
}

/**
 * The rows of an import, in the order of the source, one page.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.view`; `RES-4200`.
 */
export async function listImportRows(actor: SessionActor, id: string, query: ImportRowListQuery): Promise<LotImportRowListPage> {
  requirePermission(actor, "catalog.lot.view");
  const executor = readExecutor();
  const importKey = requireCatalogId(id);
  if ((await findImportById(executor, importKey)) === null) {
    throw notFound();
  }
  const page = await listImportRowRecords(executor, importKey, query.outcome, query);
  const rows = page.rows.map(toLotImportRowView);
  return { page: query.page, count: rows.length, totalCount: page.totalCount, rows, filterParams: query };
}

/** The width of a column of the template, in characters. */
const COLUMN_WIDTH = 26;
const INSTRUCTIONS_WIDTH = 110;

/** The text format of a sheet cell: a LOT number or a catalog number is never a number or a date (CAT-61.AC1). */
const TEXT_FORMAT = "@";

/**
 * The import template: an XLSX file with the header row in the active language
 * on the first sheet and the instructions on the second (CAT-61.AC1). The
 * catalog number column and the LOT column have the text format, so a
 * spreadsheet program keeps a value as it is typed.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.manage` (DEC-057).
 */
export async function importTemplate(actor: SessionActor, language: Language): Promise<Uint8Array<ArrayBuffer>> {
  requirePermission(actor, "catalog.lot.manage");
  const text = dictionaries[language].catalog.imports.template.file;
  const workbook = new ExcelJS.Workbook();

  const data = workbook.addWorksheet(text.dataSheet);
  data.columns = [
    { header: text.catalogNumberColumn, key: "catalogNumber", width: COLUMN_WIDTH },
    { header: text.lotColumn, key: "lotNumber", width: COLUMN_WIDTH },
    { header: text.manufacturingDateColumn, key: "manufacturingDate", width: COLUMN_WIDTH },
  ];
  data.getColumn("catalogNumber").numFmt = TEXT_FORMAT;
  data.getColumn("lotNumber").numFmt = TEXT_FORMAT;
  data.getRow(1).font = { bold: true };

  const instructions = workbook.addWorksheet(text.instructionsSheet);
  instructions.columns = [{ key: "line", width: INSTRUCTIONS_WIDTH }];
  for (const line of [
    text.instructionRows,
    text.instructionCatalogNumber,
    text.instructionLot,
    text.instructionDate,
    text.instructionLimits,
  ]) {
    instructions.addRow([line]);
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
