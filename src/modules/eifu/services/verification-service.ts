/**
 * The verification, the first step of the public lookup (IFU-50, DEC-070,
 * DEC-071, DEC-072, DEC-097).
 *
 * The step needs no session (DEC-070). It takes the inputs, the email address
 * and the consent, and gives a verification id. It never says whether the catalog
 * number or the LOT exists (IFU-50.AC3), and it never changes a product, a catalog
 * number or a LOT.
 *
 * The order of one request:
 * 1. The limits of DEC-072 are read first, so a caller over a limit gets 429
 *    `RATE-4400` before anything else (`code-prefixes.md`, selection procedure).
 * 2. The request is checked (IFU-50 rule 2). A request that fails counts against
 *    no limit.
 * 3. Each limit counts the request with one atomic `INCR` in Redis (DEC-007), so
 *    two requests at the same time cannot both take the last place.
 * 4. The row is written with the email address and the client address encrypted
 *    (IFU-90) and the code as a keyed hash (DEC-071), and the transaction
 *    commits.
 * 5. After the commit, the code mail is sent and awaited (DEC-097). When it
 *    fails, `send_failed_at` is set, the verification ends (IFU-50 rule 6), and
 *    the answer carries `UP-5500`, `UP-5501` or `UP-5000`.
 *
 * No log record holds an email address, a code, a verification id or a full
 * client address (FND-05 rule 5, DEC-139).
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { now } from "@/lib/clock";
import { getConfig } from "@/lib/config";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { cleanTransport } from "@/lib/format/transport-cleanup";
import { type FieldFault, validationError } from "@/lib/http/validation";
import { logger } from "@/lib/logging";
import { type QuotaLimit, assertUnderQuota, consumeQuota } from "@/lib/rate-limit";
import {
  LOOKUP_ISSUES,
  LOOKUP_NUMBER_MAX,
  type LookupMeta,
  MAX_CODE_ATTEMPTS,
  VERIFICATION_TTL_MS,
  type VerificationCreated,
  type VerificationInput,
  type VerificationView,
} from "@/lib/schemas/lookup";
import { resolveForwardedSource } from "@/lib/security";
import { readExecutor, runTransaction } from "@/lib/transaction";
import { sendCodeMail } from "@/modules/platform/services/mail-service";

import { encryptIdentity, generateVerificationCode, hashVerificationCode, lookupHash } from "../domain/identity";
import { findVerificationByPublicId, insertVerification, markVerificationSendFailed } from "../repositories/verification-repository";
import { verificationUuid } from "./verification-state";

/** A limit of DEC-072: the scope names the counter, and the quota is its size and its window. */
interface Limit extends QuotaLimit {
  readonly scope: string;
}

/** At most 3 verifications in 10 minutes and 10 in a day for one email address (IFU-50.AC7, AC8). */
const EMAIL_SHORT: Limit = { scope: "eifu-verification-email-10m", limit: 3, windowMs: 600_000 };
const EMAIL_DAY: Limit = { scope: "eifu-verification-email-1d", limit: 10, windowMs: 86_400_000 };
/** At most 20 verifications in an hour for one source address (IFU-50.AC9). */
const SOURCE_HOUR: Limit = { scope: "eifu-verification-source-1h", limit: 20, windowMs: 3_600_000 };

/** The most characters of a user agent that a row keeps (IFU-50 rule 7). */
const USER_AGENT_MAX = 512;

/** The subject of a source that has no usable address. All such requests share one counter. */
export const UNKNOWN_SOURCE = "unknown";

/** The source address of DEC-038 from the header of the request. */
export function sourceOf(forwardedFor: string | null): string {
  return resolveForwardedSource(forwardedFor, getConfig().TRUSTED_PROXIES ?? []) ?? UNKNOWN_SOURCE;
}

/**
 * The faults of the request that the schema cannot see (IFU-50 rule 2): the
 * numbers after the transport cleanup, the consent and the version of its text.
 * A NUL character is a fault too: the store cannot hold it in a text column.
 */
function requestFaults(input: VerificationInput): FieldFault[] {
  const faults: FieldFault[] = [];
  for (const [field, raw] of [
    ["catalogNumber", input.catalogNumber],
    ["lotNumber", input.lotNumber],
  ] as const) {
    const cleaned = cleanTransport(raw);
    if (cleaned === "") {
      faults.push({ code: "VAL-4001", entry: { field, issue: LOOKUP_ISSUES.required } });
    } else if (cleaned.length > LOOKUP_NUMBER_MAX) {
      faults.push({ code: "VAL-4006", entry: { field, issue: LOOKUP_ISSUES.outOfRange } });
    } else if (raw.includes("\u0000")) {
      faults.push({ code: "VAL-4006", entry: { field, issue: "has the wrong format" } });
    }
  }
  if (!input.noticeAccepted) {
    faults.push({ code: "VAL-4006", entry: { field: "noticeAccepted", issue: LOOKUP_ISSUES.noticeNotAccepted } });
  }
  if (input.noticeVersion !== getConfig().EIFU_LEGAL_NOTICE_VERSION) {
    faults.push({ code: "VAL-4006", entry: { field: "noticeVersion", issue: LOOKUP_ISSUES.noticeVersionNotCurrent } });
  }
  return faults;
}

/**
 * Starts a verification and sends the code mail (IFU-50 rule 3, rule 4).
 *
 * @throws RateLimitedError 429 `RATE-4400` over a limit of DEC-072 (IFU-50.AC7 to AC9).
 * @throws AppError 400 `VAL-4001`, `VAL-4006` for the numbers, the consent and the version of its text (IFU-50.AC4, AC5).
 * @throws AppError `UP-5500`, `UP-5501` or `UP-5000` when the code mail fails (IFU-50.AC10). The verification then ends (IFU-50 rule 6).
 * @throws AppError `CACHE-5500` when Redis is not there: the request is refused, never counted by guess.
 */
export async function createVerification(input: VerificationInput, meta: LookupMeta): Promise<VerificationCreated> {
  const at = now();
  const source = sourceOf(meta.forwardedFor);
  const emailSubject = input.email.toLowerCase();

  await assertUnderQuota(SOURCE_HOUR.scope, source, SOURCE_HOUR);
  await assertUnderQuota(EMAIL_SHORT.scope, emailSubject, EMAIL_SHORT);
  await assertUnderQuota(EMAIL_DAY.scope, emailSubject, EMAIL_DAY);

  const faults = requestFaults(input);
  if (faults.length > 0) {
    throw validationError(faults);
  }

  await consumeQuota(SOURCE_HOUR.scope, source, SOURCE_HOUR);
  await consumeQuota(EMAIL_SHORT.scope, emailSubject, EMAIL_SHORT);
  await consumeQuota(EMAIL_DAY.scope, emailSubject, EMAIL_DAY);

  const publicId = randomUUID();
  const code = generateVerificationCode();
  const encryptedEmail = encryptIdentity(input.email);
  const encryptedAddress = encryptIdentity(source);
  const expiresAt = new Date(at.getTime() + VERIFICATION_TTL_MS);
  // The mail runs after the commit and the answer waits for its result (DEC-097).
  // An effect of the transaction never throws, so it keeps its failure here.
  const mail: { failure: AppError | null } = { failure: null };

  await runTransaction(async (tx) => {
    await insertVerification(tx, {
      publicId,
      // The inputs as the visitor typed them (IFU-50 rule 7).
      catalogNumberInput: input.catalogNumber,
      lotNumberInput: input.lotNumber,
      noticeVersion: input.noticeVersion,
      email: encryptedEmail.cipher,
      emailLookupHash: lookupHash(input.email),
      clientAddress: encryptedAddress.cipher,
      identityKeyId: encryptedEmail.keyId,
      userAgent: meta.userAgent === null ? null : meta.userAgent.slice(0, USER_AGENT_MAX),
      codeHash: hashVerificationCode(publicId, code),
      now: at,
      expiresAt,
    });
    tx.afterCommit(async () => {
      try {
        await sendCodeMail({
          to: input.email,
          code,
          catalogNumber: cleanTransport(input.catalogNumber),
          lotNumber: cleanTransport(input.lotNumber),
        });
      } catch (error) {
        mail.failure = error instanceof AppError ? error : new AppError("UP-5000", CODE_MEANINGS["UP-5000"]);
      }
    });
  });
  logger.write({ severity: "INFO", type: "APP", message: "verification created" });

  if (mail.failure !== null) {
    const failure = mail.failure;
    await runTransaction((tx) => markVerificationSendFailed(tx, publicId, now()));
    throw new AppError(failure.code, CODE_MEANINGS[failure.code], { reason: "the code mail was not sent" });
  }
  return { id: publicId, expiresAt: expiresAt.toISOString() };
}

/**
 * Reads a verification (IFU-50 rule 5). `attemptsRemaining` is 0 when nobody can
 * use the verification any more: it is used, ended, expired or its mail failed.
 * An id that is not a UUID names no verification.
 *
 * @throws AppError 404 `RES-4200` for an unknown id.
 */
export async function getVerification(publicId: string): Promise<VerificationView> {
  const id = verificationUuid(publicId);
  const row = id === null ? null : await findVerificationByPublicId(readExecutor(), id);
  if (row === null) {
    throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"], { reason: "no verification has the id" });
  }
  const usable =
    row.usedAt === null && row.endedAt === null && row.sendFailedAt === null && row.expiresAt.getTime() > now().getTime();
  return {
    id: row.publicId,
    expiresAt: row.expiresAt.toISOString(),
    attemptsRemaining: usable ? Math.max(0, MAX_CODE_ATTEMPTS - row.attemptsUsed) : 0,
  };
}
