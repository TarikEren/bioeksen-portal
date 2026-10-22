/**
 * LOTs (CAT-30, CAT-40, CAT-41, CAT-50).
 *
 * Each function checks the permission of the actor first (DEC-029). A
 * registration and a correction write one audit row (PLT-40). The system never
 * deletes a LOT (DEC-010).
 *
 * MOCK: CAT-40, CAT-41. The functions read and write the mock store. Step 4
 * moves the work to the repositories and one transaction for each change, with
 * the same signatures.
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { type FieldFault, validationError } from "@/lib/http/validation";
import { type MockCatalogNumber, type MockLot, getCatalogMock } from "@/lib/mock/catalog";
import {
  type CorrectionInput,
  LOT_NUMBER_MAX,
  type LotListPage,
  type LotListQuery,
  type LotView,
  type RegisterLotInput,
} from "@/lib/schemas/catalog";

import { kitCodeMatches } from "../domain/kit-code";
import { cleanTransport, readEncodedDate } from "../domain/lot-number";
import { recordAudit } from "./catalog-audit";
import { byIdDescending, notFound, pageOf, toLotView } from "./catalog-views";
import { findLotByNumber, insertLot } from "./lot-store";

function requireCatalogNumberRow(id: string): MockCatalogNumber {
  const found = getCatalogMock().catalogNumbers.get(id);
  if (found === undefined) {
    throw notFound();
  }
  return found;
}

function lotViewOf(lot: MockLot): LotView {
  const catalogNumber = getCatalogMock().catalogNumbers.get(lot.catalogNumberId);
  if (catalogNumber === undefined) {
    // A LOT always has its catalog number (`restrict` on delete, CAT-40). A gap is a broken store.
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a LOT has no catalog number" });
  }
  return toLotView(lot, catalogNumber);
}

/**
 * Lists the LOTs of a product, newest first.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.view`; `RES-4200` for a product that does not exist.
 */
export async function listLots(actor: SessionActor, productId: string, query: LotListQuery): Promise<LotListPage> {
  requirePermission(actor, "catalog.lot.view");
  // MOCK: CAT-40 (list)
  const state = getCatalogMock();
  if (!state.products.has(productId)) {
    throw notFound();
  }
  const catalogNumberIds = new Set(
    [...state.catalogNumbers.values()].filter((row) => row.productId === productId).map((row) => row.id),
  );
  const matching = [...state.lots.values()]
    .filter((lot) => catalogNumberIds.has(lot.catalogNumberId))
    .filter((lot) => query.catalogNumberId === null || lot.catalogNumberId === query.catalogNumberId)
    .filter((lot) => query.conflict === null || lot.hasDateConflict === query.conflict)
    .sort(byIdDescending);
  const { slice, totalCount } = pageOf(matching, query);
  const lots = slice.map(lotViewOf);
  return Promise.resolve({ page: query.page, count: lots.length, totalCount, lots, filterParams: query });
}

/**
 * Registers one LOT under a catalog number. Transport cleanup runs once, here
 * (CAT-30 rule 4). The manufacturing date is the encoded date (CAT-40 rule 2).
 * A supplied date that equals it gives the source `SUPPLIED`. A supplied date
 * that differs gives the date-conflict flag (DEC-046). A kit-code mismatch needs
 * the confirmation of the request (DEC-050). The audit row holds both dates where
 * they differ, and the confirmation.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.manage`; `RES-4200`;
 * `VAL-4001` for a blank LOT number; `VAL-4006` on `lotNumber` (the format, the
 * date, or the kit code: three different issues) or on `expiryDate` (CAT-30.AC2,
 * AC3, CAT-40.AC6, AC7); `RES-4300` when the catalog number has the LOT number (CAT-40.AC2).
 */
export async function registerLot(actor: SessionActor, catalogNumberId: string, input: RegisterLotInput): Promise<LotView> {
  requirePermission(actor, "catalog.lot.manage");
  // MOCK: CAT-40 (register)
  const state = getCatalogMock();
  const catalogNumber = requireCatalogNumberRow(catalogNumberId);
  const product = state.products.get(catalogNumber.productId);
  if (product === undefined) {
    throw notFound();
  }

  const lotNumber = cleanTransport(input.lotNumber);
  if (lotNumber === "") {
    throw validationError([{ code: "VAL-4001", entry: { field: "lotNumber", issue: "is required" } }]);
  }
  const faults: FieldFault[] = [];
  const encoded = readEncodedDate(lotNumber);
  if (lotNumber.length > LOT_NUMBER_MAX || encoded.status === "format_invalid") {
    faults.push({ code: "VAL-4006", entry: { field: "lotNumber", issue: "does not match the LOT number format" } });
  } else if (encoded.status === "date_invalid") {
    faults.push({ code: "VAL-4006", entry: { field: "lotNumber", issue: "encodes a date that does not exist" } });
  } else {
    const mismatch = !kitCodeMatches(lotNumber, product.kitCodeBase, catalogNumber.format);
    if (mismatch && input.confirmKitCodeMismatch !== true) {
      faults.push({ code: "VAL-4006", entry: { field: "lotNumber", issue: "does not match the kit code of the catalog number" } });
    }
    if (input.expiryDate !== undefined && input.expiryDate <= encoded.date) {
      faults.push({ code: "VAL-4006", entry: { field: "expiryDate", issue: "must be after the manufacturing date" } });
    }
  }
  if (faults.length > 0 || encoded.status !== "ok") {
    throw validationError(faults);
  }
  if (findLotByNumber(catalogNumber.id, lotNumber) !== null) {
    throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the catalog number has the LOT number" });
  }

  const supplied = input.suppliedManufacturingDate ?? null;
  const hasDateConflict = supplied !== null && supplied !== encoded.date;
  const lot = insertLot(catalogNumber, {
    lotNumber,
    manufacturingDate: encoded.date,
    source: supplied === encoded.date ? "SUPPLIED" : "PARSED_FROM_LOT",
    suppliedManufacturingDate: supplied,
    expiryDate: input.expiryDate ?? null,
    hasDateConflict,
    lotImportId: null,
  });
  recordAudit(actor, {
    actionCode: "catalog.lot.registered",
    entityType: "catalog_lot",
    entityId: lot.id,
    stateBefore: null,
    stateAfter: {
      catalogNumberId: catalogNumber.id,
      lotNumber,
      manufacturingDate: lot.manufacturingDate,
      manufacturingDateSource: lot.manufacturingDateSource,
      ...(hasDateConflict ? { encodedManufacturingDate: encoded.date, suppliedManufacturingDate: supplied } : {}),
      expiryDate: lot.expiryDate,
      hasDateConflict,
      kitCodeMismatchConfirmed: input.confirmKitCodeMismatch === true,
    },
  });
  return lotViewOf(lot);
}

/**
 * Corrects the manufacturing date of a LOT with a reason (CAT-41). The LOT gets
 * the date and the source `MANUAL_CORRECTION`, and the conflict flag ends. The
 * audit row holds the date before, the date after, the encoded date and the
 * reason (DEC-014).
 *
 * @throws AppError `PERM-4150` without `catalog.lot.correct` (CAT-41.AC3);
 * `RES-4200`; `VAL-4001` for a blank reason (CAT-41.AC2); `VAL-4006` when the new
 * date is on or after the expiry date.
 */
export async function correctManufacturingDate(actor: SessionActor, lotId: string, input: CorrectionInput): Promise<LotView> {
  requirePermission(actor, "catalog.lot.correct");
  // MOCK: CAT-41
  const lot = getCatalogMock().lots.get(lotId);
  if (lot === undefined) {
    throw notFound();
  }
  const reason = input.reason.trim();
  if (reason === "") {
    throw validationError([{ code: "VAL-4001", entry: { field: "reason", issue: "is required" } }]);
  }
  if (lot.expiryDate !== null && lot.expiryDate <= input.manufacturingDate) {
    throw validationError([{ code: "VAL-4006", entry: { field: "manufacturingDate", issue: "must be before the expiry date" } }]);
  }
  const encoded = readEncodedDate(lot.lotNumber);
  const before = { manufacturingDate: lot.manufacturingDate, hasDateConflict: lot.hasDateConflict };
  lot.manufacturingDate = input.manufacturingDate;
  lot.manufacturingDateSource = "MANUAL_CORRECTION";
  lot.hasDateConflict = false;
  lot.updatedAt = now();
  recordAudit(actor, {
    actionCode: "catalog.lot.manufacturing_date_corrected",
    entityType: "catalog_lot",
    entityId: lot.id,
    stateBefore: before,
    stateAfter: {
      manufacturingDate: lot.manufacturingDate,
      encodedManufacturingDate: encoded.status === "ok" ? encoded.date : null,
      hasDateConflict: false,
    },
    reason,
  });
  return lotViewOf(lot);
}
