/**
 * The reads that the public lookup makes on the catalog (IFU-60 rule 2, steps 2
 * to 4, DEC-004: the e-IFU module reaches the catalog through its services,
 * never through its repositories).
 *
 * The lookup needs no session (DEC-070), so these reads take no actor. They are
 * the exact matches of the rule and nothing else: they give the catalog number
 * with its product, the LOT of that catalog number, and whether the LOT number
 * exists under another catalog number. They change no row. A deactivated
 * catalog number or product is found as well (IFU-62.AC8, AC10). The ids leave as
 * text, like every id between modules (DEC-009).
 */
import "server-only";

import { AppError, CODE_MEANINGS } from "@/lib/errors";
import type { LocalizedName } from "@/lib/schemas/catalog";
import { readExecutor } from "@/lib/transaction";

import { findCatalogNumbersByValues } from "../repositories/catalog-number-repository";
import { findLotByNumber, lotNumberExistsUnderOtherCatalogNumber as lotNumberExistsElsewhere } from "../repositories/lot-repository";
import { findProductById } from "../repositories/product-repository";
import { parseCatalogId } from "./catalog-views";

/** A catalog number that the exact match found, with the name of its product. */
export interface LookupCatalogNumber {
  readonly catalogNumberId: string;
  readonly productId: string;
  readonly productName: LocalizedName;
}

/** A LOT that the exact match found. */
export interface LookupLot {
  readonly lotId: string;
  readonly lotNumber: string;
  /** `YYYY-MM-DD` (DEC-039). */
  readonly manufacturingDate: string;
  readonly hasDateConflict: boolean;
}

/**
 * The catalog number with an exact match, or `null` (IFU-60 rule 2, step 2).
 * The catalog number is unique in the catalog (DEC-042), so there is one match.
 *
 * @throws AppError `DB-5000` when a catalog number has no product (the store is broken).
 */
export async function findCatalogNumberForLookup(catalogNumber: string): Promise<LookupCatalogNumber | null> {
  const executor = readExecutor();
  const [row] = await findCatalogNumbersByValues(executor, [catalogNumber]);
  if (row === undefined) {
    return null;
  }
  const product = await findProductById(executor, row.productId);
  if (product === null) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a catalog number has no product" });
  }
  return { catalogNumberId: String(row.id), productId: String(product.id), productName: product.name };
}

/** The LOT of the catalog number with an exact match, or `null` (IFU-60 rule 2, step 3). The letter case stays as typed. */
export async function findLotForLookup(catalogNumberId: string, lotNumber: string): Promise<LookupLot | null> {
  const key = parseCatalogId(catalogNumberId);
  if (key === null) {
    return null;
  }
  const row = await findLotByNumber(readExecutor(), key, lotNumber);
  return row === null
    ? null
    : { lotId: String(row.id), lotNumber: row.lotNumber, manufacturingDate: row.manufacturingDate, hasDateConflict: row.hasDateConflict };
}

/** Whether a LOT with this LOT number exists under another catalog number (IFU-60 rule 2, step 4). */
export async function lotNumberExistsUnderOtherCatalogNumber(lotNumber: string, catalogNumberId: string): Promise<boolean> {
  const key = parseCatalogId(catalogNumberId);
  return key === null ? false : lotNumberExistsElsewhere(readExecutor(), lotNumber, key);
}
