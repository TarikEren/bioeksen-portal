/**
 * The resolution of a lookup (IFU-60 rule 2, DEC-060, DEC-061, DEC-062, DEC-066,
 * DEC-067, DEC-068, DEC-069).
 *
 * `resolve` walks the steps of IFU-60 rule 2 in their order over the reads that
 * it is given. It does no I/O of its own: the service gives it reads on the
 * catalog services and the eifu repositories (DEC-004), and a unit test gives it
 * reads on a fixture.
 *
 * - It never sorts by a revision label, a version, a date or an id (rule 3). The
 *   one sort is the order of the files by the language code (DEC-069).
 * - It never falls back to another version. The step of the periods reads at most
 *   `PERIOD_LIMIT` rows: two rows are enough to know that the applicability is
 *   ambiguous, and no more are read.
 * - An override bypasses the manufacturing date and nothing else (DEC-066). A date
 *   conflict stops the lookup before the override is read (DEC-067).
 */
import type { LocalizedName } from "@/lib/schemas/catalog";
import type { DocumentTitle, VersionStatus } from "@/lib/schemas/eifu";
import type { Outcome } from "@/lib/schemas/lookup";
// The transport cleanup is a pure function of the catalog (CAT-30 rule 1). The
// resolution reads no catalog row through it.
import { cleanTransport } from "@/modules/catalog/domain/lot-number";

/** The most periods that the step of the periods reads (IFU-60 rule 2, step 7). */
export const PERIOD_LIMIT = 2;

/** The catalog number that the exact match found, with its product. A deactivated catalog number is found too (step 2). */
export interface CatalogHit {
  readonly catalogNumberId: string;
  readonly productId: string;
  readonly productName: LocalizedName;
}

/** The LOT that the exact match found. */
export interface LotHit {
  readonly lotId: string;
  readonly lotNumber: string;
  /** `YYYY-MM-DD` (DEC-039). */
  readonly manufacturingDate: string;
  readonly hasDateConflict: boolean;
}

/** A document version that a step found, with what the answer shows of its document. */
export interface VersionHit {
  readonly versionId: string;
  readonly status: VersionStatus;
  readonly documentNumber: string;
  readonly documentTitle: DocumentTitle;
  /** The revision label. */
  readonly revision: string;
}

/** An active file of a version. `fileId` is for the signed URL and never leaves the service. */
export interface ResolvedFile {
  readonly fileId: string;
  readonly languageCode: string;
  readonly contentType: string;
  readonly fileSizeBytes: number;
  readonly fileHash: string;
}

/** What the resolution reads. Each read is exact. None of them changes a row (IFU-60 rule 1). */
export interface ResolutionReads {
  /** Step 2: the catalog number with an exact match. */
  findCatalogNumber(catalogNumber: string): Promise<CatalogHit | null>;
  /** Step 3: the LOT of that catalog number with an exact match. The letter case stays as typed. */
  findLot(catalogNumberId: string, lotNumber: string): Promise<LotHit | null>;
  /** Step 4: whether a LOT with that LOT number exists under another catalog number. */
  lotNumberExistsUnderOtherCatalogNumber(lotNumber: string, catalogNumberId: string): Promise<boolean>;
  /** Step 6: the version that the active override of the LOT names, whatever its state. `null` without an active override. */
  findActiveOverrideTarget(lotId: string): Promise<VersionHit | null>;
  /**
   * Step 7: the versions of the live periods of the product that contain the date
   * and have a `PUBLISHED` or `SUPERSEDED` version. At most `limit` rows.
   */
  findPeriodVersions(productId: string, date: string, limit: number): Promise<readonly VersionHit[]>;
  /** Steps 6 and 8: the active files of a version. */
  findActiveFiles(versionId: string): Promise<readonly ResolvedFile[]>;
}

/** The inputs as the verification stored them. The resolution cleans them (step 1). */
export interface ResolutionInput {
  readonly catalogNumber: string;
  readonly lotNumber: string;
}

/** The result of the walk. It holds ids for the access record and the signed URLs, so it never goes to a caller as it is. */
export interface Resolution {
  readonly outcome: Outcome;
  /** The cleaned catalog number. */
  readonly catalogNumber: string;
  /** The cleaned LOT number. */
  readonly lotNumber: string;
  readonly catalog: CatalogHit | null;
  readonly lot: LotHit | null;
  /** The version that the walk found, also when its outcome is `NO_FILE_FOR_VERSION` or `OVERRIDE_TARGET_NOT_PUBLISHED`. */
  readonly version: VersionHit | null;
  readonly resolvedViaOverride: boolean;
  /** The active files, in the order of the language code. Empty unless the outcome is `RESOLVED`. */
  readonly files: readonly ResolvedFile[];
}

/** An override can give a version only in these states (DEC-066). */
function isLookupStatus(status: VersionStatus): boolean {
  return status === "PUBLISHED" || status === "SUPERSEDED";
}

/** The order of the language codes: by the code units, never by the locale of the host (DEC-069). */
function byLanguageCode(left: ResolvedFile, right: ResolvedFile): number {
  if (left.languageCode === right.languageCode) {
    return 0;
  }
  return left.languageCode < right.languageCode ? -1 : 1;
}

/**
 * Walks the steps of IFU-60 rule 2.
 *
 * @param input The inputs of the verification, as the visitor typed them.
 */
export async function resolve(input: ResolutionInput, reads: ResolutionReads): Promise<Resolution> {
  // Step 1.
  const catalogNumber = cleanTransport(input.catalogNumber);
  const lotNumber = cleanTransport(input.lotNumber);
  const base = { catalogNumber, lotNumber };
  const none = { ...base, catalog: null, lot: null, version: null, resolvedViaOverride: false, files: [] } as const;

  // Step 2.
  const catalog = await reads.findCatalogNumber(catalogNumber);
  if (catalog === null) {
    return { ...none, outcome: "CATALOG_NUMBER_NOT_FOUND" };
  }

  // Steps 3 and 4.
  const lot = await reads.findLot(catalog.catalogNumberId, lotNumber);
  if (lot === null) {
    const elsewhere = await reads.lotNumberExistsUnderOtherCatalogNumber(lotNumber, catalog.catalogNumberId);
    return { ...none, catalog, outcome: elsewhere ? "LOT_CATALOG_MISMATCH" : "LOT_NOT_FOUND" };
  }
  const found = { ...none, catalog, lot };

  // Step 5. A date conflict stops the lookup, also with an active override (DEC-067).
  if (lot.hasDateConflict) {
    return { ...found, outcome: "LOT_DATE_CONFLICT" };
  }

  // Step 6.
  const target = await reads.findActiveOverrideTarget(lot.lotId);
  if (target !== null) {
    if (!isLookupStatus(target.status)) {
      return { ...found, version: target, outcome: "OVERRIDE_TARGET_NOT_PUBLISHED" };
    }
    return finishWithFiles({ ...found, version: target, resolvedViaOverride: true }, reads);
  }

  // Step 7.
  const [first, second] = await reads.findPeriodVersions(catalog.productId, lot.manufacturingDate, PERIOD_LIMIT);
  if (first === undefined) {
    return { ...found, outcome: "NO_APPLICABLE_VERSION" };
  }
  if (second !== undefined) {
    return { ...found, outcome: "AMBIGUOUS_APPLICABILITY" };
  }

  // Step 8.
  return finishWithFiles({ ...found, version: first, resolvedViaOverride: false }, reads);
}

/** The last step of both paths: a version with no active file gives `NO_FILE_FOR_VERSION` (steps 6 and 8). */
async function finishWithFiles(
  partial: Omit<Resolution, "outcome" | "files"> & { readonly version: VersionHit },
  reads: ResolutionReads,
): Promise<Resolution> {
  const files = await reads.findActiveFiles(partial.version.versionId);
  if (files.length === 0) {
    return { ...partial, files: [], outcome: "NO_FILE_FOR_VERSION" };
  }
  return { ...partial, files: [...files].sort(byLanguageCode), outcome: "RESOLVED" };
}
