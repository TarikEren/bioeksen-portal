/**
 * The lookup, the second step of the public lookup (IFU-51, IFU-60, IFU-80,
 * DEC-070, DEC-071, DEC-073, DEC-097).
 *
 * The step needs no session. It takes the verification id and the code (IFU-51).
 * A correct code uses the verification and writes one access record, in one
 * transaction (IFU-51.AC8), and then the resolution of IFU-60 gives the outcome.
 * A lookup that finds no document is still a 200 with its outcome (DEC-073). The
 * error envelope is only for a fault of the request.
 *
 * **MOCK (stage B4, step 2).** The verification store, the access record store,
 * the rate limit, the catalog and the document reads, and the download URLs are
 * mocks (`src/lib/mock/lookup.ts`). The resolution is the real one
 * (`../domain/resolution.ts`) over reads on the fixture of IFU-60. Step 4 gives it
 * reads on the catalog services and the eifu repositories (DEC-004), runs the
 * mark of the verification and the insert of the access record in one
 * transaction with the encrypted identity (IFU-90), and signs the URLs after the
 * commit (DEC-076).
 *
 * No log record holds an email address, a code or a client address (FND-05
 * rule 5, DEC-139).
 */
import "server-only";

import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS, RateLimitedError } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { logger } from "@/lib/logging";
import {
  MOCK_CATALOG_NUMBERS,
  MOCK_CODE,
  MOCK_FILES,
  MOCK_LOTS,
  MOCK_PRODUCTS,
  MOCK_VERSIONS,
  type MockVerification,
  mockDownloadUrl,
  mockFindVerification,
  mockInsertAccessRecord,
  mockMarkUsed,
  mockRateRecord,
  mockRateRetryAfter,
  mockRegisterWrongCode,
} from "@/lib/mock/lookup";
import { findRequestContext } from "@/lib/request-context";
import {
  LOOKUP_ISSUES,
  type LookupAnswer,
  type LookupFile,
  type LookupInput,
  type LookupMeta,
  MAX_CODE_ATTEMPTS,
} from "@/lib/schemas/lookup";

import {
  type ResolutionReads,
  type ResolvedFile,
  type VersionHit,
  type Resolution,
  resolve,
} from "../domain/resolution";
import { sourceOf } from "./verification-service";

/** At most 30 lookups from one source address in 10 minutes (DEC-072, IFU-51.AC10). */
const SOURCE_LOOKUPS = { scope: "eifu-lookup-source-10m", limit: 30, windowMs: 600_000 } as const;

/**
 * The reads of the resolution over the fixture of IFU-60.
 * MOCK: IFU-60, the catalog services and the eifu repositories
 */
function mockReads(): ResolutionReads {
  const versionHit = (versionId: string): VersionHit | null => {
    const version = MOCK_VERSIONS.find((candidate) => candidate.id === versionId);
    return version === undefined
      ? null
      : {
          versionId: version.id,
          status: version.status,
          documentNumber: version.documentNumber,
          documentTitle: version.title,
          revision: version.revision,
        };
  };
  return {
    findCatalogNumber: (catalogNumber) => {
      const number = MOCK_CATALOG_NUMBERS.find((candidate) => candidate.catalogNumber === catalogNumber);
      const product = number === undefined ? undefined : MOCK_PRODUCTS.find((candidate) => candidate.id === number.productId);
      return Promise.resolve(
        number === undefined || product === undefined
          ? null
          : { catalogNumberId: number.id, productId: product.id, productName: product.name },
      );
    },
    findLot: (catalogNumberId, lotNumber) => {
      const lot = MOCK_LOTS.find((candidate) => candidate.catalogNumberId === catalogNumberId && candidate.lotNumber === lotNumber);
      return Promise.resolve(
        lot === undefined
          ? null
          : { lotId: lot.id, lotNumber: lot.lotNumber, manufacturingDate: lot.manufacturingDate, hasDateConflict: lot.hasDateConflict },
      );
    },
    lotNumberExistsUnderOtherCatalogNumber: (lotNumber, catalogNumberId) =>
      Promise.resolve(MOCK_LOTS.some((lot) => lot.lotNumber === lotNumber && lot.catalogNumberId !== catalogNumberId)),
    // The fixture has no override.
    findActiveOverrideTarget: () => Promise.resolve(null),
    findPeriodVersions: (productId, date, limit) =>
      Promise.resolve(
        MOCK_VERSIONS.filter(
          (version) =>
            version.productId === productId &&
            (version.status === "PUBLISHED" || version.status === "SUPERSEDED") &&
            version.effectiveFrom <= date &&
            (version.effectiveTo === null || date < version.effectiveTo),
        )
          .slice(0, limit)
          .flatMap((version) => versionHit(version.id) ?? []),
      ),
    findActiveFiles: (versionId) =>
      Promise.resolve(
        MOCK_FILES.filter((file) => file.versionId === versionId).map(
          (file): ResolvedFile => ({
            fileId: file.id,
            languageCode: file.languageCode,
            contentType: file.contentType,
            fileSizeBytes: file.fileSizeBytes,
            fileHash: file.fileHash,
          }),
        ),
      ),
  };
}

/** The refusal of a verification that nobody can use: used, ended, expired or its mail failed (IFU-51.AC2, AC4, AC5, AC7). */
function unusable(reason: string): AppError {
  return new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason });
}

function unusableReason(verification: MockVerification, at: Date): string | null {
  if (verification.sendFailedAt !== null) {
    return "the code mail of the verification failed";
  }
  if (verification.usedAt !== null) {
    return "the verification is used";
  }
  if (verification.endedAt !== null) {
    return "the verification ended after the fifth wrong code";
  }
  if (verification.expiresAt.getTime() <= at.getTime()) {
    return "the verification expired";
  }
  return null;
}

/** The name of the file of a download (DEC-076). It never holds the name of the upload. */
function downloadFileName(documentNumber: string, revision: string, languageCode: string): string {
  return `${documentNumber}-rev${revision}-${languageCode}.pdf`;
}

/** The answer of a resolution (IFU-60 rule 4, rule 5). It holds no row id and no storage key. */
function answerOf(resolution: Resolution, meta: LookupMeta): LookupAnswer {
  const { catalogNumber, lotNumber, lot, catalog, version } = resolution;
  if (resolution.outcome !== "RESOLVED") {
    return {
      outcome: resolution.outcome,
      catalogNumber,
      lotNumber,
      ...(lot === null ? {} : { manufacturingDate: lot.manufacturingDate }),
    };
  }
  if (lot === null || catalog === null || version === null) {
    // A resolved walk always found the LOT, the product and the version.
    throw new AppError("SYS-5000", "Unhandled error", { reason: "a resolved lookup has no LOT, product or version" });
  }
  const files: LookupFile[] = resolution.files.map((file) => ({
    languageCode: file.languageCode,
    contentType: file.contentType,
    fileSizeBytes: file.fileSizeBytes,
    fileHash: file.fileHash,
    // The signed URL is made after the commit (DEC-097).
    downloadUrl: mockDownloadUrl(downloadFileName(version.documentNumber, version.revision, file.languageCode)),
  }));
  return {
    outcome: "RESOLVED",
    catalogNumber,
    lotNumber,
    manufacturingDate: lot.manufacturingDate,
    productName: catalog.productName[meta.language],
    documentNumber: version.documentNumber,
    documentTitle: version.documentTitle[meta.language],
    revision: version.revision,
    resolvedViaOverride: resolution.resolvedViaOverride,
    files,
  };
}

/**
 * Checks the code, uses the verification, resolves the LOT and writes the access
 * record (IFU-51, IFU-60, IFU-80).
 *
 * The order is the one of `sds-logging` (`code-prefixes.md`): the limit of the
 * source, then the request. The check of the code is the last check before the
 * mark, so a wrong code uses one of the five tries (IFU-51.AC3) and a right code
 * after the fifth is refused (IFU-51.AC4).
 *
 * @throws RateLimitedError 429 `RATE-4400` over 30 lookups in 10 minutes (IFU-51.AC10).
 * @throws AppError 400 `VAL-4006` on `verificationId` for an unknown id (IFU-51.AC6), and on `code` for a wrong code (IFU-51.AC3).
 * @throws AppError 409 `RES-4302` for a used, ended, expired or failed verification (IFU-51.AC2, AC4, AC5, AC7, AC8).
 * @throws AppError 500 `DB-5001` when the access record cannot be written (IFU-80.AC6).
 */
export async function lookup(input: LookupInput, meta: LookupMeta): Promise<LookupAnswer> {
  const at = now();
  const source = sourceOf(meta.forwardedFor);
  // MOCK: DEC-072, the rate limits in Redis
  const retryAfter = mockRateRetryAfter(SOURCE_LOOKUPS.scope, source, SOURCE_LOOKUPS.limit, SOURCE_LOOKUPS.windowMs, at.getTime());
  if (retryAfter !== null) {
    throw new RateLimitedError(retryAfter, "the source has too many lookups in the window");
  }
  mockRateRecord(SOURCE_LOOKUPS.scope, source, SOURCE_LOOKUPS.windowMs, at.getTime());

  const verification = mockFindVerification(input.verificationId);
  if (verification === null) {
    throw validationError([{ code: "VAL-4006", entry: { field: "verificationId", issue: LOOKUP_ISSUES.verificationNotFound } }]);
  }
  const reason = unusableReason(verification, at);
  if (reason !== null) {
    throw unusable(reason);
  }

  // MOCK: DEC-071, the keyed hash of the code
  if (input.code !== MOCK_CODE) {
    mockRegisterWrongCode(verification.id, at, MAX_CODE_ATTEMPTS);
    throw validationError([{ code: "VAL-4006", entry: { field: "code", issue: LOOKUP_ISSUES.codeWrong } }]);
  }

  // The mark and the access record are one transaction in step 4 (IFU-51.AC8).
  if (!mockMarkUsed(verification.id, at)) {
    throw unusable("the verification was used by another lookup");
  }
  const resolution = await resolve(
    { catalogNumber: verification.catalogNumberInput, lotNumber: verification.lotNumberInput },
    mockReads(),
  );
  mockInsertAccessRecord({
    catalogNumberInput: verification.catalogNumberInput,
    lotNumberInput: verification.lotNumberInput,
    resolvedProductId: resolution.catalog?.productId ?? null,
    resolvedDocumentVersionId: resolution.version?.versionId ?? null,
    outcome: resolution.outcome,
    resolvedViaOverride: resolution.resolvedViaOverride,
    acknowledgedNoticeVersion: verification.noticeVersion,
    requestId: findRequestContext()?.requestId ?? null,
    createdAt: at,
  });
  logger.write({ severity: "INFO", type: "APP", message: "lookup recorded", tail: { outcome: resolution.outcome } });
  return answerOf(resolution, meta);
}
