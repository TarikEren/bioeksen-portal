/**
 * The verification, the first step of the public lookup (IFU-50, DEC-070,
 * DEC-071, DEC-072, DEC-097).
 *
 * The step needs no session (DEC-070). It takes the inputs, the email address
 * and the consent, and gives a verification id. It never says whether the catalog
 * number or the LOT exists (IFU-50.AC3), and it never changes a product, a catalog
 * number or a LOT.
 *
 * **MOCK (stage B4, step 2).** The verification store, the code, the code mail
 * and the rate limits are mocks (`src/lib/mock/lookup.ts`). Step 4 moves the row
 * to `eifu_verification` with the email address and the client address encrypted
 * (`../domain/identity.ts`), the code to a keyed hash, the limits to Redis, and
 * the code mail to `mail-service.ts`, sent after the commit and awaited
 * (DEC-097). The checks and the answers here are the real ones.
 *
 * No log record holds an email address, a code or a client address (FND-05
 * rule 5, DEC-139).
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { now } from "@/lib/clock";
import { getConfig } from "@/lib/config";
import { AppError, CODE_MEANINGS, RateLimitedError } from "@/lib/errors";
import { type FieldFault, validationError } from "@/lib/http/validation";
import { logger } from "@/lib/logging";
import {
  mockDigest,
  mockFindVerification,
  mockInsertVerification,
  mockMailFailure,
  mockMarkSendFailed,
  mockRateRecord,
  mockRateRetryAfter,
} from "@/lib/mock/lookup";
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
import { cleanTransport } from "@/modules/catalog/domain/lot-number";

/** The limits of DEC-072 for a verification. Each one counts the requests that pass the checks. */
const EMAIL_SHORT = { scope: "eifu-verification-email-10m", limit: 3, windowMs: 600_000 } as const;
const EMAIL_DAY = { scope: "eifu-verification-email-1d", limit: 10, windowMs: 86_400_000 } as const;
const SOURCE_HOUR = { scope: "eifu-verification-source-1h", limit: 20, windowMs: 3_600_000 } as const;

/** The subject of a source that has no usable address. All such requests share one counter. */
export const UNKNOWN_SOURCE = "unknown";

/** The source address of DEC-038 from the header of the request. */
export function sourceOf(forwardedFor: string | null): string {
  return resolveForwardedSource(forwardedFor, getConfig().TRUSTED_PROXIES ?? []) ?? UNKNOWN_SOURCE;
}

interface RateLimit {
  readonly scope: string;
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * @throws RateLimitedError 429 `RATE-4400` with the seconds until the subject may try again.
 */
function assertBelow(rule: RateLimit, subject: string, at: number): void {
  // MOCK: DEC-072, the rate limits in Redis
  const retryAfter = mockRateRetryAfter(rule.scope, subject, rule.limit, rule.windowMs, at);
  if (retryAfter !== null) {
    throw new RateLimitedError(retryAfter, `the ${rule.scope} limit is reached`);
  }
}

/**
 * The faults of the request that the schema cannot see (IFU-50 rule 2): the
 * numbers after the transport cleanup, the consent and the version of its text.
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
 * The order is the one of `sds-logging` (`code-prefixes.md`): the limits, then the
 * request. A request that a limit or a fault refuses counts against no limit.
 *
 * @throws RateLimitedError 429 `RATE-4400` over a limit of DEC-072 (IFU-50.AC7 to AC9).
 * @throws AppError 400 `VAL-4001`, `VAL-4006` for the numbers, the consent and the version of its text (IFU-50.AC4, AC5).
 * @throws AppError `UP-5500`, `UP-5501` or `UP-5000` when the code mail fails (IFU-50.AC10). The verification then ends (IFU-50 rule 6).
 */
export async function createVerification(input: VerificationInput, meta: LookupMeta): Promise<VerificationCreated> {
  const at = now();
  const source = sourceOf(meta.forwardedFor);
  const emailDigest = mockDigest(input.email);

  assertBelow(SOURCE_HOUR, source, at.getTime());
  assertBelow(EMAIL_SHORT, emailDigest, at.getTime());
  assertBelow(EMAIL_DAY, emailDigest, at.getTime());

  const faults = requestFaults(input);
  if (faults.length > 0) {
    throw validationError(faults);
  }

  mockRateRecord(SOURCE_HOUR.scope, source, SOURCE_HOUR.windowMs, at.getTime());
  mockRateRecord(EMAIL_SHORT.scope, emailDigest, EMAIL_SHORT.windowMs, at.getTime());
  mockRateRecord(EMAIL_DAY.scope, emailDigest, EMAIL_DAY.windowMs, at.getTime());

  const verification = mockInsertVerification({
    id: randomUUID(),
    // The inputs as the visitor typed them (IFU-50 rule 7).
    catalogNumberInput: input.catalogNumber,
    lotNumberInput: input.lotNumber,
    noticeVersion: input.noticeVersion,
    expiresAt: new Date(at.getTime() + VERIFICATION_TTL_MS),
  });
  logger.write({ severity: "INFO", type: "APP", message: "verification created" });

  // The mail goes after the commit, and the answer waits for the result (DEC-097).
  const failure = mockMailFailure(input.email);
  if (failure !== null) {
    mockMarkSendFailed(verification.id, now());
    throw new AppError(failure, CODE_MEANINGS[failure], { reason: "the code mail was not sent" });
  }
  return { id: verification.id, expiresAt: verification.expiresAt.toISOString() };
}

/**
 * Reads a verification (IFU-50 rule 5). `attemptsRemaining` is 0 when nobody can
 * use the verification any more: it is used, ended, expired or its mail failed.
 * A malformed id never reaches this function: the route answers 404 for it.
 *
 * @throws AppError 404 `RES-4200` for an unknown id.
 */
export function getVerification(publicId: string): Promise<VerificationView> {
  // MOCK: IFU-50, the table eifu_verification
  const verification = mockFindVerification(publicId);
  if (verification === null) {
    return Promise.reject(new AppError("RES-4200", CODE_MEANINGS["RES-4200"], { reason: "no verification has the id" }));
  }
  const usable =
    verification.usedAt === null &&
    verification.endedAt === null &&
    verification.sendFailedAt === null &&
    verification.expiresAt.getTime() > now().getTime();
  return Promise.resolve({
    id: verification.id,
    expiresAt: verification.expiresAt.toISOString(),
    attemptsRemaining: usable ? Math.max(0, MAX_CODE_ATTEMPTS - verification.attemptsUsed) : 0,
  });
}
