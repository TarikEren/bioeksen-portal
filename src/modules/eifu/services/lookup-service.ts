/**
 * The lookup, the second step of the public lookup (IFU-51, IFU-60, IFU-80,
 * DEC-070, DEC-071, DEC-073, DEC-097).
 *
 * The step needs no session. It takes the verification id and the code (IFU-51).
 * A lookup that finds no document is still a 200 with its outcome (DEC-073). The
 * error envelope is only for a fault of the request.
 *
 * The order of one request:
 * 1. The limit of the source counts the request with one atomic `INCR`
 *    (IFU-51.AC10). It comes first (`code-prefixes.md`, selection procedure).
 * 2. The verification is read. An unknown id is `VAL-4006` on `verificationId`
 *    (IFU-51.AC6). A used, ended, expired or failed verification is 409
 *    `RES-4302` (IFU-51.AC2, AC4, AC5, AC7).
 * 3. The code is checked against its keyed hash (DEC-071). A wrong code uses one
 *    of five tries, in a transaction that locks the row, and the fifth ends the
 *    verification (IFU-51.AC3). A code that is not six digits is a wrong code.
 * 4. A correct code runs the resolution of IFU-60 over the reads of
 *    `lookup-reads.ts`.
 * 5. One transaction marks the verification used with a conditional update and
 *    writes the access record with the encrypted identity (IFU-51.AC8, IFU-80).
 *    Of two lookups with the correct code at the same time, one changes the row
 *    and gets a result, and the other one gets 409. When the access record
 *    cannot be written, the transaction rolls back, the verification stays
 *    unused, and the answer is 500 `DB-5001` with no download link (IFU-80.AC6).
 * 6. After the commit, the signed download URLs are made (DEC-076, DEC-097).
 *
 * No log record holds an email address, a code, a verification id, a signed URL
 * or a full client address (FND-05 rule 5, DEC-139).
 */
import "server-only";

import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { logger } from "@/lib/logging";
import { type QuotaLimit, consumeQuota } from "@/lib/rate-limit";
import { findRequestContext } from "@/lib/request-context";
import {
  LOOKUP_ISSUES,
  type LookupAnswer,
  type LookupFile,
  type LookupInput,
  type LookupMeta,
  MAX_CODE_ATTEMPTS,
} from "@/lib/schemas/lookup";
import { readExecutor, runTransaction } from "@/lib/transaction";
import { signedDownloadUrl } from "@/modules/platform/services/file-service";

import { decryptIdentity, encryptIdentity, verificationCodeMatches } from "../domain/identity";
import { type Resolution, resolve } from "../domain/resolution";
import { insertAccessRecord } from "../repositories/access-record-repository";
import {
  type VerificationRow,
  findVerificationByPublicId,
  markVerificationUsed,
  writeAttempts,
} from "../repositories/verification-repository";
import { createLookupReads } from "./lookup-reads";
import { unusableReason, verificationUuid } from "./verification-state";
import { sourceOf } from "./verification-service";

/** At most 30 lookups from one source address in 10 minutes (DEC-072, IFU-51.AC10). */
const SOURCE_LOOKUPS: QuotaLimit & { readonly scope: string } = { scope: "eifu-lookup-source-10m", limit: 30, windowMs: 600_000 };

/** A download link works for 5 minutes (DEC-076). */
const DOWNLOAD_URL_SECONDS = 300;

/** The refusal of a verification that nobody can use: used, ended, expired or its mail failed (IFU-51.AC2, AC4, AC5, AC7). */
function unusable(reason: string): AppError {
  return new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason });
}

/**
 * Uses one try of the verification after a wrong code (IFU-51.AC3). The row is
 * locked, so two wrong codes at the same time use two tries, and the fifth try
 * ends the verification (DEC-071).
 *
 * @throws AppError 409 `RES-4302` when another request ended the verification before this one got the lock.
 */
async function registerWrongCode(publicId: string, at: Date): Promise<void> {
  await runTransaction(async (tx) => {
    const current = await findVerificationByPublicId(tx, publicId, true);
    const reason = current === null ? "the verification is gone" : unusableReason(current, at);
    if (current === null || reason !== null) {
      throw unusable(reason ?? "the verification is gone");
    }
    const used = current.attemptsUsed + 1;
    await writeAttempts(tx, publicId, used, used >= MAX_CODE_ATTEMPTS ? at : null);
  });
}

/** The name of the file of a download (DEC-076). It never holds the name of the upload. */
function downloadFileName(documentNumber: string, revision: string, languageCode: string): string {
  return `${documentNumber}-rev${revision}-${languageCode}.pdf`;
}

/** The answer of a resolution that gives no document (IFU-60 rule 4). */
function unresolvedAnswer(resolution: Resolution): LookupAnswer {
  if (resolution.outcome === "RESOLVED") {
    throw new AppError("SYS-5000", "Unhandled error", { reason: "a resolved lookup has no document answer" });
  }
  return {
    outcome: resolution.outcome,
    catalogNumber: resolution.catalogNumber,
    lotNumber: resolution.lotNumber,
    ...(resolution.lot === null ? {} : { manufacturingDate: resolution.lot.manufacturingDate }),
  };
}

/**
 * The answer of a `RESOLVED` lookup, with one signed URL for each file. The
 * caller runs it after the commit (DEC-097). The answer holds no row id, no
 * storage key and no file name (IFU-60 rule 5).
 *
 * @throws AppError `UP-5500`, `UP-5501` or `UP-5000` when the object store fails; `RES-4200` when a stored object is gone.
 */
async function resolvedAnswer(
  resolution: Resolution,
  meta: LookupMeta,
  storageKeyOf: (fileId: string) => string | undefined,
): Promise<LookupAnswer> {
  const { catalogNumber, lotNumber, lot, catalog, version } = resolution;
  if (lot === null || catalog === null || version === null) {
    // A resolved walk always found the LOT, the product and the version.
    throw new AppError("SYS-5000", "Unhandled error", { reason: "a resolved lookup has no LOT, product or version" });
  }
  const files: LookupFile[] = await Promise.all(
    resolution.files.map(async (file): Promise<LookupFile> => {
      const key = storageKeyOf(file.fileId);
      if (key === undefined) {
        throw new AppError("SYS-5000", "Unhandled error", { reason: "a resolved file has no storage key" });
      }
      return {
        languageCode: file.languageCode,
        contentType: file.contentType,
        fileSizeBytes: file.fileSizeBytes,
        fileHash: file.fileHash,
        downloadUrl: await signedDownloadUrl(key, {
          expiresInSeconds: DOWNLOAD_URL_SECONDS,
          attachmentName: downloadFileName(version.documentNumber, version.revision, file.languageCode),
        }),
      };
    }),
  );
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

/** The id of a stored number as a key, or `null` when the resolution found none. */
function toId(value: string | undefined): bigint | null {
  return value === undefined ? null : BigInt(value);
}

/**
 * Uses the verification and writes the access record in one transaction
 * (IFU-51.AC8, IFU-80 rule 3).
 *
 * @throws AppError 409 `RES-4302` when another lookup used the verification first; 500 `DB-5001` when the access record cannot be written.
 */
async function recordLookup(row: VerificationRow, resolution: Resolution, at: Date): Promise<void> {
  // The identity is written again under the first key of the ring, so a new
  // record names the new key (IFU-90 rule 3, AC2).
  const email = encryptIdentity(decryptIdentity(row.email, row.identityKeyId));
  const clientAddress = encryptIdentity(decryptIdentity(row.clientAddress, row.identityKeyId));
  await runTransaction(async (tx) => {
    if (!(await markVerificationUsed(tx, row.publicId, at, MAX_CODE_ATTEMPTS))) {
      throw unusable("the verification was used by another lookup");
    }
    await insertAccessRecord(tx, {
      catalogNumberInput: row.catalogNumberInput,
      lotNumberInput: row.lotNumberInput,
      resolvedProductId: toId(resolution.catalog?.productId),
      resolvedDocumentVersionId: toId(resolution.version?.versionId),
      outcome: resolution.outcome,
      resolvedViaOverride: resolution.resolvedViaOverride,
      acknowledgedNoticeVersion: row.noticeVersion,
      email: email.cipher,
      clientAddress: clientAddress.cipher,
      emailLookupHash: row.emailLookupHash,
      identityKeyId: email.keyId,
      userAgent: row.userAgent,
      requestId: findRequestContext()?.requestId ?? null,
      now: at,
    });
  });
}

/**
 * Checks the code, uses the verification, resolves the LOT and writes the access
 * record (IFU-51, IFU-60, IFU-80).
 *
 * @throws RateLimitedError 429 `RATE-4400` over 30 lookups in 10 minutes (IFU-51.AC10).
 * @throws AppError 400 `VAL-4006` on `verificationId` for an unknown id (IFU-51.AC6), and on `code` for a wrong code (IFU-51.AC3).
 * @throws AppError 409 `RES-4302` for a used, ended, expired or failed verification (IFU-51.AC2, AC4, AC5, AC7, AC8).
 * @throws AppError 500 `DB-5001` when the access record cannot be written (IFU-80.AC6).
 * @throws AppError `UP-5500`, `UP-5501` or `UP-5000` when the object store does not sign a link after the commit.
 */
export async function lookup(input: LookupInput, meta: LookupMeta): Promise<LookupAnswer> {
  const at = now();
  await consumeQuota(SOURCE_LOOKUPS.scope, sourceOf(meta.forwardedFor), SOURCE_LOOKUPS);

  const publicId = verificationUuid(input.verificationId);
  const row = publicId === null ? null : await findVerificationByPublicId(readExecutor(), publicId);
  if (row === null) {
    throw validationError([{ code: "VAL-4006", entry: { field: "verificationId", issue: LOOKUP_ISSUES.verificationNotFound } }]);
  }
  const reason = unusableReason(row, at);
  if (reason !== null) {
    throw unusable(reason);
  }

  if (!verificationCodeMatches(row.codeHash, row.publicId, input.code)) {
    await registerWrongCode(row.publicId, at);
    throw validationError([{ code: "VAL-4006", entry: { field: "code", issue: LOOKUP_ISSUES.codeWrong } }]);
  }

  const { reads, storageKeyOf } = createLookupReads();
  const resolution = await resolve({ catalogNumber: row.catalogNumberInput, lotNumber: row.lotNumberInput }, reads);
  await recordLookup(row, resolution, at);
  logger.write({ severity: "INFO", type: "APP", message: "lookup recorded", tail: { outcome: resolution.outcome } });

  // The URLs come after the commit (DEC-097).
  return resolution.outcome === "RESOLVED" ? resolvedAnswer(resolution, meta, storageKeyOf) : unresolvedAnswer(resolution);
}
