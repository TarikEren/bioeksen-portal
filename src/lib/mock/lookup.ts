/**
 * The mock data of the public lookup (stage B4, step 2 of `crisis_mode.md`).
 *
 * It holds the fixture of IFU-60, a store of verifications, a store of access
 * records and the counters of the rate limits. Step 4 moves them to the database
 * and to Redis, and deletes this file and each `MOCK:` comment.
 *
 * **The code.** Each mock verification has the code `123456` (`MOCK_CODE`). The
 * mock sends no mail.
 *
 * **The mail failures.** An email address whose domain is `mail-down.invalid`,
 * `mail-slow.invalid` or `mail-refused.invalid` makes the mock mail fail with
 * `UP-5500`, `UP-5501` or `UP-5000` (IFU-50.AC10). A page can use them to show
 * the failure.
 *
 * **The fixture** (IFU-60, IFU-61, IFU-62):
 *
 * | Catalog number | LOT number | Date | Result |
 * |---|---|---|---|
 * | `BS-GHPV-L-100` | `B2406151224GHPVV` | 2024-06-15 | `RESOLVED`, revision `01` |
 * | `BS-GHPV-L-100` | `B2603091224GHPVV` | 2026-03-09 | `RESOLVED`, revision `03` |
 * | `BS-GHPV-L-100` | `B2301011224GHPVV` | 2023-01-01 | `NO_APPLICABLE_VERSION` |
 * | `BS-GHPV-L-100` | `B2506011224GHPVV` | 2025-06-01 | `LOT_DATE_CONFLICT` |
 * | `BS-GHPV-L-100` | `B2602101224RSVFF` | | `LOT_CATALOG_MISMATCH` (the LOT is of `BS-RSVF-L-050`) |
 * | `BS-GHPV-L-100` | any other | | `LOT_NOT_FOUND` |
 * | any other | any | | `CATALOG_NUMBER_NOT_FOUND` |
 *
 * The product `BS-GHPV-L` has the document `KTL-0042`: revision `01` from
 * 2024-01-01 to 2025-01-01 (`SUPERSEDED`), `02` from 2025-01-01 to 2026-01-01
 * (`SUPERSEDED`) and `03` from 2026-01-01 with no end (`PUBLISHED`), each with an
 * active `tr` and `en` file. The product `BS-RSVF-L` has no document.
 *
 * **What the mock keeps.** It keeps no email address, no code and no client
 * address: a verification holds the SHA-256 of the lower-case email address, only
 * for the rate limit, and an access record holds no identity (IFU-90 is real in
 * `src/modules/eifu/domain/identity.ts`, and step 4 stores the encrypted values).
 *
 * The state is a module-level singleton that also lives on `globalThis`, because
 * a route handler, a server action and a page can load this module as separate
 * instances in `next dev`. Only mock code does this.
 */
import "server-only";

import { createHash } from "node:crypto";

import type { ErrorCode } from "@/lib/errors";
import type { VersionStatus } from "@/lib/schemas/eifu";
import type { Outcome } from "@/lib/schemas/lookup";

/** The code of each mock verification. */
export const MOCK_CODE = "123456";

// ----------------------------------------------------------------- fixture

export interface MockProduct {
  readonly id: string;
  readonly name: { readonly tr: string; readonly en: string };
}

export interface MockCatalogNumber {
  readonly id: string;
  readonly productId: string;
  readonly catalogNumber: string;
}

export interface MockLot {
  readonly id: string;
  readonly catalogNumberId: string;
  readonly lotNumber: string;
  readonly manufacturingDate: string;
  readonly hasDateConflict: boolean;
}

export interface MockVersion {
  readonly id: string;
  readonly productId: string;
  readonly documentNumber: string;
  readonly title: { readonly tr: string; readonly en: string };
  readonly revision: string;
  readonly status: VersionStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface MockFile {
  readonly id: string;
  readonly versionId: string;
  readonly languageCode: string;
  readonly contentType: string;
  readonly fileSizeBytes: number;
  readonly fileHash: string;
}

export const MOCK_PRODUCTS: readonly MockProduct[] = [
  { id: "1", name: { tr: "GHPV Gastrointestinal Paneli", en: "GHPV Gastrointestinal Panel" } },
  { id: "2", name: { tr: "RSVF Solunum Paneli", en: "RSVF Respiratory Panel" } },
];

export const MOCK_CATALOG_NUMBERS: readonly MockCatalogNumber[] = [
  { id: "1", productId: "1", catalogNumber: "BS-GHPV-L-100" },
  { id: "2", productId: "2", catalogNumber: "BS-RSVF-L-050" },
];

export const MOCK_LOTS: readonly MockLot[] = [
  { id: "1", catalogNumberId: "1", lotNumber: "B2406151224GHPVV", manufacturingDate: "2024-06-15", hasDateConflict: false },
  { id: "2", catalogNumberId: "1", lotNumber: "B2603091224GHPVV", manufacturingDate: "2026-03-09", hasDateConflict: false },
  { id: "3", catalogNumberId: "1", lotNumber: "B2301011224GHPVV", manufacturingDate: "2023-01-01", hasDateConflict: false },
  { id: "4", catalogNumberId: "1", lotNumber: "B2506011224GHPVV", manufacturingDate: "2025-06-01", hasDateConflict: true },
  { id: "5", catalogNumberId: "2", lotNumber: "B2602101224RSVFF", manufacturingDate: "2026-02-10", hasDateConflict: false },
];

const DOCUMENT_TITLE = { tr: "GHPV Kullanım Talimatı", en: "GHPV Instructions for Use" } as const;

export const MOCK_VERSIONS: readonly MockVersion[] = [
  { id: "1", productId: "1", documentNumber: "KTL-0042", title: DOCUMENT_TITLE, revision: "01", status: "SUPERSEDED", effectiveFrom: "2024-01-01", effectiveTo: "2025-01-01" },
  { id: "2", productId: "1", documentNumber: "KTL-0042", title: DOCUMENT_TITLE, revision: "02", status: "SUPERSEDED", effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01" },
  { id: "3", productId: "1", documentNumber: "KTL-0042", title: DOCUMENT_TITLE, revision: "03", status: "PUBLISHED", effectiveFrom: "2026-01-01", effectiveTo: null },
];

/** The hash of a mock file: a SHA-256 of a fixed text, so the value has the form of the real one. */
function mockFileHash(versionId: string, languageCode: string): string {
  return createHash("sha256").update(`mock-file:${versionId}:${languageCode}`).digest("hex");
}

export const MOCK_FILES: readonly MockFile[] = MOCK_VERSIONS.flatMap((version, index) =>
  (["tr", "en"] as const).map((languageCode, position): MockFile => ({
    id: String(index * 2 + position + 1),
    versionId: version.id,
    languageCode,
    contentType: "application/pdf",
    fileSizeBytes: 184_320 + index * 4_096 + position * 512,
    fileHash: mockFileHash(version.id, languageCode),
  })),
);

/**
 * The mock of the signed URL (DEC-076). The real URL is a signed storage URL that
 * works for 5 minutes, made after the commit. This path serves no file.
 */
export function mockDownloadUrl(fileName: string): string {
  // MOCK: DEC-076, the signed storage URL of a file
  return `/mock-downloads/${encodeURIComponent(fileName)}`;
}

// ------------------------------------------------------------------- state

export interface MockVerification {
  readonly id: string;
  /** The inputs as the visitor typed them (IFU-50 rule 7). */
  readonly catalogNumberInput: string;
  readonly lotNumberInput: string;
  readonly noticeVersion: string;
  readonly expiresAt: Date;
  attemptsUsed: number;
  usedAt: Date | null;
  endedAt: Date | null;
  sendFailedAt: Date | null;
}

export interface MockAccessRecord {
  readonly id: string;
  readonly catalogNumberInput: string;
  readonly lotNumberInput: string;
  readonly resolvedProductId: string | null;
  readonly resolvedDocumentVersionId: string | null;
  readonly outcome: Outcome;
  readonly resolvedViaOverride: boolean;
  readonly acknowledgedNoticeVersion: string;
  readonly emailVerified: true;
  readonly requestId: string | null;
  readonly createdAt: Date;
}

interface MockLookupState {
  readonly verifications: Map<string, MockVerification>;
  readonly accessRecords: MockAccessRecord[];
  /** The times of the hits of a limit, in milliseconds, by the hash of the scope and the subject. */
  readonly rateHits: Map<string, number[]>;
}

const STATE_KEY = Symbol.for("bioeksen.mock.lookup");

function isLookupState(value: unknown): value is MockLookupState {
  return typeof value === "object" && value !== null && "verifications" in value && "accessRecords" in value && "rateHits" in value;
}

function getState(): MockLookupState {
  const stored: unknown = Reflect.get(globalThis, STATE_KEY);
  if (isLookupState(stored)) {
    return stored;
  }
  const fresh: MockLookupState = { verifications: new Map(), accessRecords: [], rateHits: new Map() };
  Reflect.set(globalThis, STATE_KEY, fresh);
  return fresh;
}

/** Puts the state back to empty. A mock page or a demo calls it to start again. */
export function resetLookupMock(): void {
  Reflect.deleteProperty(globalThis, STATE_KEY);
}

// ---------------------------------------------------------- the mail (IFU-50)

const MAIL_FAILURES: Readonly<Record<string, ErrorCode>> = {
  "mail-down.invalid": "UP-5500",
  "mail-slow.invalid": "UP-5501",
  "mail-refused.invalid": "UP-5000",
};

/**
 * The mock of the code mail (PLT-20, IFU-50 rule 4). It sends nothing. It gives
 * the code of the failure that the domain of the address asks for, or `null`.
 */
export function mockMailFailure(email: string): ErrorCode | null {
  // MOCK: PLT-20, the code mail and its failures
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return MAIL_FAILURES[domain] ?? null;
}

/** The SHA-256 of a text, in hexadecimal. The mock keys its counters by it, so it holds no email address. */
export function mockDigest(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

// ------------------------------------------------------ the rate limits (DEC-072)

function rateKey(scope: string, subject: string): string {
  return `${scope}:${subject}`;
}

/**
 * The mock of the Redis counters (DEC-007, DEC-072). It returns the whole seconds
 * until the subject may try again, or `null` when the subject is below the limit.
 */
export function mockRateRetryAfter(scope: string, subject: string, limit: number, windowMs: number, at: number): number | null {
  // MOCK: DEC-072, the rate limits in Redis
  const hits = (getState().rateHits.get(rateKey(scope, subject)) ?? []).filter((time) => time > at - windowMs);
  if (hits.length < limit) {
    return null;
  }
  const blocking = hits[hits.length - limit];
  return blocking === undefined ? 1 : Math.max(1, Math.ceil((blocking + windowMs - at) / 1000));
}

/** Counts one hit of a subject. The window is the longest one that the scope uses. */
export function mockRateRecord(scope: string, subject: string, windowMs: number, at: number): void {
  // MOCK: DEC-072, the rate limits in Redis
  const state = getState();
  const key = rateKey(scope, subject);
  const kept = (state.rateHits.get(key) ?? []).filter((time) => time > at - windowMs);
  kept.push(at);
  state.rateHits.set(key, kept);
}

// ------------------------------------------------------ verifications (IFU-50)

export interface NewMockVerification {
  readonly id: string;
  readonly catalogNumberInput: string;
  readonly lotNumberInput: string;
  readonly noticeVersion: string;
  readonly expiresAt: Date;
}

/** The mock of the insert into `eifu_verification`. */
export function mockInsertVerification(row: NewMockVerification): MockVerification {
  // MOCK: IFU-50, the table eifu_verification
  const verification: MockVerification = {
    ...row,
    attemptsUsed: 0,
    usedAt: null,
    endedAt: null,
    sendFailedAt: null,
  };
  getState().verifications.set(verification.id, verification);
  return verification;
}

/** The mock of the read of `eifu_verification` by its public id. */
export function mockFindVerification(id: string): MockVerification | null {
  // MOCK: IFU-50, the table eifu_verification
  return getState().verifications.get(id) ?? null;
}

/** The mock of `send_failed_at`: nobody can use the verification after it (IFU-50 rule 4, rule 6). */
export function mockMarkSendFailed(id: string, at: Date): void {
  // MOCK: IFU-50, send_failed_at
  const verification = getState().verifications.get(id);
  if (verification !== undefined) {
    verification.sendFailedAt = at;
    verification.endedAt = at;
  }
}

/**
 * The mock of a wrong code (IFU-51.AC3, DEC-071): one more try is used, and the
 * last try ends the verification. It returns the tries that are used.
 */
export function mockRegisterWrongCode(id: string, at: Date, maxAttempts: number): number {
  // MOCK: IFU-51, attempts_used and ended_at
  const verification = getState().verifications.get(id);
  if (verification === undefined) {
    return maxAttempts;
  }
  verification.attemptsUsed += 1;
  if (verification.attemptsUsed >= maxAttempts) {
    verification.endedAt = at;
  }
  return verification.attemptsUsed;
}

/**
 * The mock of the mark `used_at` (IFU-51.AC8): it succeeds one time only, so
 * exactly one of two lookups with the code gets a result. The mock runs in one
 * step, so the check and the mark cannot be split. The database does this with a
 * conditional update in the transaction of the lookup.
 *
 * @returns `false` when the verification is used, ended or failed.
 */
export function mockMarkUsed(id: string, at: Date): boolean {
  // MOCK: IFU-51.AC8, used_at in the transaction of the lookup
  const verification = getState().verifications.get(id);
  if (verification === undefined || verification.usedAt !== null || verification.endedAt !== null || verification.sendFailedAt !== null) {
    return false;
  }
  verification.usedAt = at;
  verification.endedAt = at;
  return true;
}

// ---------------------------------------------------- access records (IFU-80)

export type NewMockAccessRecord = Omit<MockAccessRecord, "id" | "emailVerified">;

/** The mock of the insert into `eifu_access_record`. It keeps no identity (IFU-90 is real in step 4). */
export function mockInsertAccessRecord(row: NewMockAccessRecord): MockAccessRecord {
  // MOCK: IFU-80, the table eifu_access_record
  const state = getState();
  const record: MockAccessRecord = { ...row, id: String(state.accessRecords.length + 1), emailVerified: true };
  state.accessRecords.push(record);
  return record;
}
