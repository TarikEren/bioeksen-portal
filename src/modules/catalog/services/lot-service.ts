/**
 * LOTs (CAT-30, CAT-40, CAT-41, CAT-50).
 *
 * Each function checks the permission of the actor first (DEC-029). A
 * registration and a correction run in one transaction with their audit row
 * (PLT-40). The system never deletes a LOT (DEC-010).
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { type FieldFault, validationError } from "@/lib/http/validation";
import { type Executor, readExecutor, runTransaction } from "@/lib/transaction";
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
import {
  type CatalogNumberRow,
  findCatalogNumberById,
  listCatalogNumbersOfProducts,
} from "../repositories/catalog-number-repository";
import {
  type LotRow,
  findLotById,
  findLotByNumber,
  insertLot,
  listLotRows,
  updateLotManufacturingDate,
} from "../repositories/lot-repository";
import { findProductById } from "../repositories/product-repository";
import { recordAudit } from "./catalog-audit";
import { notFound, requireCatalogId, toLotView } from "./catalog-views";

/** The catalog number of a LOT. A LOT always has one (`restrict` on delete, CAT-40): a gap is a broken store. */
async function catalogNumberOfLot(executor: Executor, lot: LotRow): Promise<CatalogNumberRow> {
  const catalogNumber = await findCatalogNumberById(executor, lot.catalogNumberId);
  if (catalogNumber === null) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a LOT has no catalog number" });
  }
  return catalogNumber;
}

/**
 * Lists the LOTs of a product, newest first.
 *
 * @throws AppError `PERM-4150` without `catalog.lot.view`; `RES-4200` for a product that does not exist.
 */
export async function listLots(actor: SessionActor, productId: string, query: LotListQuery): Promise<LotListPage> {
  requirePermission(actor, "catalog.lot.view");
  const executor = readExecutor();
  const productKey = requireCatalogId(productId);
  if ((await findProductById(executor, productKey)) === null) {
    throw notFound();
  }
  const catalogNumbers = await listCatalogNumbersOfProducts(executor, [productKey]);
  // A catalog number of another product names no LOT of this product.
  const wanted = query.catalogNumberId === null ? null : BigInt(query.catalogNumberId);
  const scope = catalogNumbers.filter((row) => wanted === null || row.id === wanted);
  const page = await listLotRows(executor, {
    catalogNumberIds: scope.map((row) => row.id),
    conflict: query.conflict,
    page: query.page,
    limit: query.limit,
  });
  const byId = new Map(scope.map((row) => [row.id, row]));
  const lots = page.rows.map((lot) => {
    const catalogNumber = byId.get(lot.catalogNumberId);
    if (catalogNumber === undefined) {
      throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a LOT has no catalog number" });
    }
    return toLotView(lot, catalogNumber);
  });
  return { page: query.page, count: lots.length, totalCount: page.totalCount, lots, filterParams: query };
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
  const catalogNumberKey = requireCatalogId(catalogNumberId);
  return runTransaction(async (tx) => {
    // Shared locks until the commit: a move of the catalog number and a change of
    // the stem or the status of the product (CAT-20 rule 3, CAT-10 rule 3) wait
    // for this registration, so they see its LOT.
    const catalogNumber = await findCatalogNumberById(tx, catalogNumberKey, "share");
    if (catalogNumber === null) {
      throw notFound();
    }
    const product = await findProductById(tx, catalogNumber.productId, "share");
    if (product === null) {
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
    // A second registration with the same LOT number between this check and the
    // insert fails on `lot_unique_per_catalog_number` with the same `RES-4300`.
    if ((await findLotByNumber(tx, catalogNumber.id, lotNumber)) !== null) {
      throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the catalog number has the LOT number" });
    }

    const supplied = input.suppliedManufacturingDate ?? null;
    const hasDateConflict = supplied !== null && supplied !== encoded.date;
    const lot = await insertLot(tx, {
      catalogNumberId: catalogNumber.id,
      lotNumber,
      manufacturingDate: encoded.date,
      manufacturingDateSource: supplied === encoded.date ? "SUPPLIED" : "PARSED_FROM_LOT",
      suppliedManufacturingDate: supplied,
      expiryDate: input.expiryDate ?? null,
      hasDateConflict,
      lotImportId: null,
      now: now(),
    });
    await recordAudit(tx, actor, {
      actionCode: "catalog.lot.registered",
      entityType: "catalog_lot",
      entityId: String(lot.id),
      stateBefore: null,
      stateAfter: {
        catalogNumberId: String(catalogNumber.id),
        lotNumber,
        manufacturingDate: lot.manufacturingDate,
        manufacturingDateSource: lot.manufacturingDateSource,
        // CAT-40 rule 6: both dates where they differ.
        ...(hasDateConflict ? { encodedManufacturingDate: encoded.date, suppliedManufacturingDate: supplied } : {}),
        expiryDate: lot.expiryDate,
        hasDateConflict,
        kitCodeMismatchConfirmed: input.confirmKitCodeMismatch === true,
      },
    });
    return toLotView(lot, catalogNumber);
  });
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
  const lotKey = requireCatalogId(lotId);
  return runTransaction(async (tx) => {
    const lot = await findLotById(tx, lotKey, "update");
    if (lot === null) {
      throw notFound();
    }
    const reason = input.reason.trim();
    if (reason === "") {
      throw validationError([{ code: "VAL-4001", entry: { field: "reason", issue: "is required" } }]);
    }
    if (lot.expiryDate !== null && lot.expiryDate <= input.manufacturingDate) {
      throw validationError([{ code: "VAL-4006", entry: { field: "manufacturingDate", issue: "must be before the expiry date" } }]);
    }
    const catalogNumber = await catalogNumberOfLot(tx, lot);
    const encoded = readEncodedDate(lot.lotNumber);
    const at = now();
    await updateLotManufacturingDate(tx, lot.id, input.manufacturingDate, at);
    await recordAudit(tx, actor, {
      actionCode: "catalog.lot.manufacturing_date_corrected",
      entityType: "catalog_lot",
      entityId: String(lot.id),
      stateBefore: { manufacturingDate: lot.manufacturingDate, hasDateConflict: lot.hasDateConflict },
      stateAfter: {
        manufacturingDate: input.manufacturingDate,
        encodedManufacturingDate: encoded.status === "ok" ? encoded.date : null,
        hasDateConflict: false,
      },
      reason,
    });
    return toLotView(
      {
        ...lot,
        manufacturingDate: input.manufacturingDate,
        manufacturingDateSource: "MANUAL_CORRECTION",
        hasDateConflict: false,
        updatedAt: at,
      },
      catalogNumber,
    );
  });
}
