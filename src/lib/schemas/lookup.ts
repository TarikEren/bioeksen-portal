/**
 * The schemas and types of the public lookup (stage B4 contract, IFU-50, IFU-51,
 * IFU-60, IFU-62).
 *
 * A zod schema is the one source of its type, as in `eifu.ts`. A body is a strict
 * object: an unknown field is 400 `VAL-4007` (IFU-51.AC9). The identifier of a
 * verification is a random UUID (DEC-121). A business date is `YYYY-MM-DD`
 * (DEC-039); a time is an RFC 3339 text with an offset.
 *
 * The schemas read the shape. The services read the rules that need the
 * configuration or the data: the transport cleanup of the numbers (CAT-30), the
 * current consent text version (IFU-50 rule 2) and the verification code. A
 * `LookupAnswer` has no `status` member: the envelope adds it (`{ status: "ok" }
 * & LookupAnswer`).
 *
 * This file is pure.
 */
import { z } from "zod";

import type { Language } from "@/lib/i18n/languages";

const timestamp = z.iso.datetime({ offset: true });
/** A calendar date, `YYYY-MM-DD` (DEC-039). */
const businessDate = z.iso.date();

/** A catalog number and a LOT number have 1 to 64 characters after the transport cleanup (IFU-50 rule 2). */
export const LOOKUP_NUMBER_MAX = 64;
/**
 * The longest text that the schema takes for a number, before the transport
 * cleanup. The cleanup removes only a BOM, white space and quotes at the ends, so
 * a text this long cannot hold a number of 64 characters after the cleanup in
 * any normal case; the service checks the 64 after it.
 */
export const LOOKUP_NUMBER_RAW_MAX = 256;
/** An email address has at most 254 characters (IFU-50 rule 2). */
export const EMAIL_MAX = 254;
/** The verification code has six digits (DEC-070). */
export const VERIFICATION_CODE_LENGTH = 6;
/** The most wrong codes of one verification. The fifth wrong code ends it (DEC-071). */
export const MAX_CODE_ATTEMPTS = 5;
/** A verification code is valid for 10 minutes (DEC-071). */
export const VERIFICATION_TTL_MS = 600_000;

/** The nine outcomes of a lookup (IFU-60 rule 2, IFU-62, DEC-073). */
export const OUTCOMES = [
  "RESOLVED",
  "CATALOG_NUMBER_NOT_FOUND",
  "LOT_NOT_FOUND",
  "LOT_CATALOG_MISMATCH",
  "LOT_DATE_CONFLICT",
  "NO_APPLICABLE_VERSION",
  "AMBIGUOUS_APPLICABILITY",
  "NO_FILE_FOR_VERSION",
  "OVERRIDE_TARGET_NOT_PUBLISHED",
] as const;
export const Outcome = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof Outcome>;

/** The outcomes that give no document (IFU-70 rule 5: each has its own text and its code). */
export const UNRESOLVED_OUTCOMES = [
  "CATALOG_NUMBER_NOT_FOUND",
  "LOT_NOT_FOUND",
  "LOT_CATALOG_MISMATCH",
  "LOT_DATE_CONFLICT",
  "NO_APPLICABLE_VERSION",
  "AMBIGUOUS_APPLICABILITY",
  "NO_FILE_FOR_VERSION",
  "OVERRIDE_TARGET_NOT_PUBLISHED",
] as const;
export const UnresolvedOutcome = z.enum(UNRESOLVED_OUTCOMES);
export type UnresolvedOutcome = z.infer<typeof UnresolvedOutcome>;

/**
 * The phrases of the `details` entries that the page must match (the pattern of
 * `EIFU_ISSUES`). The services use these values and no other text for the
 * faults below, so the page can pick its message from the field and the phrase.
 * The generic phrases (`is required`, `is out of range`, `has the wrong format`,
 * `is not a field of this endpoint`) are those of `src/lib/http/validation.ts`.
 */
export const LOOKUP_ISSUES = {
  /** A number that is blank after the transport cleanup (`catalogNumber`, `lotNumber`; code `VAL-4001`). */
  required: "is required",
  /** A number of more than 64 characters after the cleanup (`catalogNumber`, `lotNumber`; code `VAL-4006`). */
  outOfRange: "is out of range",
  /** `noticeAccepted` is not `true` (IFU-50.AC4; code `VAL-4006`). */
  noticeNotAccepted: "must be accepted",
  /** `noticeVersion` is not the current consent text version (IFU-50.AC5; code `VAL-4006`). */
  noticeVersionNotCurrent: "is not the current notice version",
  /** `code` is not the verification code (IFU-51.AC3; code `VAL-4006`). */
  codeWrong: "is not the verification code",
  /** `verificationId` names no verification (IFU-51.AC6; code `VAL-4006`). */
  verificationNotFound: "does not name a verification",
} as const;

export type LookupIssue = (typeof LOOKUP_ISSUES)[keyof typeof LOOKUP_ISSUES];

// ---------------------------------------------------------------- requests

/**
 * `POST verifications` (IFU-50 rule 1). A missing field is `VAL-4001` (IFU-50.AC6).
 * `noticeAccepted` is a boolean, so the service answers `VAL-4006` for `false`
 * (IFU-50.AC4) with the phrase of `LOOKUP_ISSUES`.
 */
export const VerificationInput = z.strictObject({
  catalogNumber: z.string().max(LOOKUP_NUMBER_RAW_MAX),
  lotNumber: z.string().max(LOOKUP_NUMBER_RAW_MAX),
  email: z.string().trim().max(EMAIL_MAX).pipe(z.email()),
  noticeVersion: z.string().max(64),
  noticeAccepted: z.boolean(),
});
export type VerificationInput = z.infer<typeof VerificationInput>;

/**
 * `POST lookups` (IFU-51). A `code` of any other text than the six digits is a
 * wrong code, and it counts as a try (IFU-51.AC3), so the schema gives it no
 * format.
 */
export const LookupInput = z.strictObject({
  verificationId: z.uuid(),
  code: z.string().max(32),
});
export type LookupInput = z.infer<typeof LookupInput>;

/** What the entry point knows about the request. It is not a field of the body. */
export interface LookupMeta {
  /** The value of `X-Forwarded-For`. The source address of DEC-038 comes from it, with `TRUSTED_PROXIES`. */
  readonly forwardedFor: string | null;
  /** The `User-Agent` of the request. The row keeps at most 512 characters (IFU-50 rule 7). */
  readonly userAgent: string | null;
  /** The language of the page. It chooses the language of `productName` and `documentTitle`. */
  readonly language: Language;
}

// --------------------------------------------------------------- responses

/** The answer of `POST verifications` (IFU-50 rule 3): the id and the end of the 10 minutes. */
export const VerificationCreated = z.strictObject({
  id: z.uuid(),
  expiresAt: timestamp,
});
export type VerificationCreated = z.infer<typeof VerificationCreated>;

/** The answer of `GET verifications/{id}` (IFU-50 rule 5). `attemptsRemaining` is 0 when nobody can use the verification. */
export const VerificationView = VerificationCreated.extend({
  attemptsRemaining: z.number().int().min(0).max(MAX_CODE_ATTEMPTS),
});
export type VerificationView = z.infer<typeof VerificationView>;

/**
 * One file of a resolved version (IFU-60 rule 5). The answer never holds a row
 * id, a storage key, a file name or an `isActive` flag.
 */
export const LookupFile = z.strictObject({
  languageCode: z.string(),
  contentType: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  fileHash: z.string(),
  /** A signed storage URL that works for 5 minutes (DEC-076). */
  downloadUrl: z.string(),
});
export type LookupFile = z.infer<typeof LookupFile>;

/** An outcome that gives a document (IFU-60 rule 4). */
export const LookupResolved = z.strictObject({
  outcome: z.literal("RESOLVED"),
  /** The number after the transport cleanup. */
  catalogNumber: z.string(),
  lotNumber: z.string(),
  manufacturingDate: businessDate,
  /** The name in the language of the request. */
  productName: z.string(),
  documentNumber: z.string(),
  /** The title in the language of the request. */
  documentTitle: z.string(),
  /** The revision label. */
  revision: z.string(),
  resolvedViaOverride: z.boolean(),
  /** Sorted by the language code (DEC-069). */
  files: z.array(LookupFile),
});
export type LookupResolved = z.infer<typeof LookupResolved>;

/** Any other outcome: no document and no files. `manufacturingDate` is there when the lookup found the LOT (IFU-60 rule 4). */
export const LookupUnresolved = z.strictObject({
  outcome: UnresolvedOutcome,
  catalogNumber: z.string(),
  lotNumber: z.string(),
  manufacturingDate: businessDate.optional(),
});
export type LookupUnresolved = z.infer<typeof LookupUnresolved>;

/** The answer of `POST lookups`. Narrow it with `outcome === "RESOLVED"`. */
export const LookupAnswer = z.union([LookupResolved, LookupUnresolved]);
export type LookupAnswer = z.infer<typeof LookupAnswer>;
