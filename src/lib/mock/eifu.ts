/**
 * The mock data of the e-IFU module (stage B3, step 2 of `crisis_mode.md`).
 *
 * It holds one document `KTL-0042` of the product `BS-GHPV-L`, with three
 * versions, the files, one replacement, one active override and the audit rows
 * that the mock services write. Step 4 moves them to the database and deletes
 * this file and each `MOCK:` comment.
 *
 * | Id | Version | State | Period | Files |
 * |---|---|---|---|---|
 * | 1 | `01` | `SUPERSEDED` | [2024-01-01, 2025-01-01) | `tr` (1), `en` (2) |
 * | 2 | `02` | `PUBLISHED` | [2025-01-01, open) | `tr` (3, replaced), `en` (4), `tr` (5, the replacement) |
 * | 3 | `03` | `DRAFT` | none | none |
 *
 * Replacement 1 replaced file 3 with file 5 in version `02`. Override 1 binds
 * the LOT 1 of the catalog mock (`B2603091224GHPVV`) to the version `01`, which
 * is `SUPERSEDED`.
 *
 * The mock keeps no copy of a product or a LOT. The services read them through
 * the catalog (DEC-004). A fresh database has no product 1, so
 * `MOCK_PRODUCTS` and `MOCK_LOTS` give the two records that the seed names, and
 * a service falls back to them for those ids only.
 *
 * The state is a module-level singleton that also lives on `globalThis`, because
 * a route handler, a server action and a page can load this module as separate
 * instances in `next dev`. Only mock code does this.
 */
import "server-only";

import { createHash } from "node:crypto";

import type { LotRef, ProductRef } from "@/lib/schemas/catalog";
import type { DocumentTitle, VersionStatus } from "@/lib/schemas/eifu";

export interface MockDocument {
  readonly id: string;
  readonly documentNumber: string;
  title: DocumentTitle;
  productId: string;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface MockVersion {
  readonly id: string;
  readonly documentId: string;
  readonly revision: string;
  status: VersionStatus;
  proposedEffectiveFrom: string | null;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  supersededAt: Date | null;
  withdrawnAt: Date | null;
  withdrawnByUserId: string | null;
  withdrawalReason: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface MockFile {
  readonly id: string;
  readonly versionId: string;
  readonly languageCode: string;
  readonly storageKey: string;
  readonly fileHash: string;
  readonly fileSizeBytes: number;
  readonly contentType: string;
  readonly originalFilename: string | null;
  isActive: boolean;
  readonly createdAt: Date;
}

export interface MockPeriod {
  readonly id: string;
  readonly versionId: string;
  readonly productId: string;
  readonly effectiveFrom: string;
  effectiveTo: string | null;
  withdrawnAt: Date | null;
}

export interface MockReplacement {
  readonly id: string;
  readonly versionId: string;
  readonly languageCode: string;
  readonly previousFileId: string;
  readonly replacementFileId: string;
  readonly previousFileHash: string;
  readonly replacementFileHash: string;
  readonly replacedByUserId: string;
  readonly replacedAt: Date;
  readonly reason: string;
}

export interface MockOverride {
  readonly id: string;
  readonly lotId: string;
  readonly versionId: string;
  readonly reason: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  isActive: boolean;
  endedByUserId: string | null;
  endedAt: Date | null;
  endReason: string | null;
}

/** An audit row of `platform_audit_record`, as the real `appendAudit` will write it (PLT-40). */
export interface MockAuditRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorUserId: string;
  readonly actionCode: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly stateBefore: unknown;
  readonly stateAfter: unknown;
  readonly reason: string | null;
}

export interface MockEifuState {
  readonly documents: Map<string, MockDocument>;
  readonly versions: Map<string, MockVersion>;
  readonly files: Map<string, MockFile>;
  readonly periods: Map<string, MockPeriod>;
  readonly replacements: Map<string, MockReplacement>;
  readonly overrides: Map<string, MockOverride>;
  readonly audit: MockAuditRow[];
  nextDocumentId: number;
  nextVersionId: number;
  nextFileId: number;
  nextPeriodId: number;
  nextReplacementId: number;
  nextOverrideId: number;
  nextAuditId: number;
}

/** The product that the seed names, for a database that has no product 1 yet. */
export const MOCK_PRODUCTS: ReadonlyMap<string, ProductRef> = new Map([
  [
    "1",
    {
      id: "1",
      internalCode: "BS-GHPV-L",
      name: { tr: "HPV Genotipleme Kiti", en: "HPV Genotyping Kit" },
      regulatoryStatus: "IVD",
      isActive: true,
    },
  ],
]);

/** The LOT that the seed names, for a database that has no LOT 1 yet. */
export const MOCK_LOTS: ReadonlyMap<string, LotRef> = new Map([
  [
    "1",
    {
      id: "1",
      lotNumber: "B2603091224GHPVV",
      manufacturingDate: "2026-03-09",
      hasDateConflict: false,
      catalogNumberId: "1",
      catalogNumber: "BS-GHPV-L-100",
      productId: "1",
      product: {
        id: "1",
        internalCode: "BS-GHPV-L",
        name: { tr: "HPV Genotipleme Kiti", en: "HPV Genotyping Kit" },
        regulatoryStatus: "IVD",
        isActive: true,
      },
    },
  ],
]);

const STATE_KEY = Symbol.for("bioeksen.mock.eifu");

/** The id of the user that made the seed. It is the IFU Manager of the B1 mock. */
const SEED_USER_ID = "2";

/** The storage key of PLT-10 rule 3. */
export function storageKeyOf(documentId: string, versionId: string, languageCode: string, sha256: string): string {
  return `documents/${documentId}/${versionId}/${languageCode}/${sha256}.pdf`;
}

function seed(): MockEifuState {
  const created = new Date("2026-10-06T09:00:00.000Z");
  const hashOf = (label: string): string => createHash("sha256").update(`mock file ${label}`).digest("hex");

  const version = (
    id: string,
    revision: string,
    status: VersionStatus,
    published: { readonly at: Date } | null,
    supersededAt: Date | null,
  ): MockVersion => ({
    id,
    documentId: "1",
    revision,
    status,
    proposedEffectiveFrom: null,
    publishedAt: published?.at ?? null,
    publishedByUserId: published === null ? null : SEED_USER_ID,
    supersededAt,
    withdrawnAt: null,
    withdrawnByUserId: null,
    withdrawalReason: null,
    createdAt: created,
    updatedAt: created,
  });
  const file = (id: string, versionId: string, languageCode: string, isActive: boolean, size: number): MockFile => {
    const fileHash = hashOf(id);
    return {
      id,
      versionId,
      languageCode,
      storageKey: storageKeyOf("1", versionId, languageCode, fileHash),
      fileHash,
      fileSizeBytes: size,
      contentType: "application/pdf",
      originalFilename: `KTL-0042-${languageCode}.pdf`,
      isActive,
      createdAt: created,
    };
  };

  const files = [
    file("1", "1", "tr", true, 412_000),
    file("2", "1", "en", true, 405_000),
    file("3", "2", "tr", false, 431_000),
    file("4", "2", "en", true, 428_000),
    file("5", "2", "tr", true, 433_500),
  ];
  const fileOf = (id: string): MockFile => {
    const found = files.find((candidate) => candidate.id === id);
    if (found === undefined) {
      throw new Error("the mock seed has no such file");
    }
    return found;
  };

  return {
    documents: new Map([
      [
        "1",
        {
          id: "1",
          documentNumber: "KTL-0042",
          title: { tr: "HPV Genotipleme Kiti Kullanma Talimatı", en: "HPV Genotyping Kit Instructions for Use" },
          productId: "1",
          createdAt: created,
          updatedAt: created,
        },
      ],
    ]),
    versions: new Map([
      ["1", version("1", "01", "SUPERSEDED", { at: new Date("2025-12-20T08:00:00.000Z") }, new Date("2025-12-20T08:00:00.000Z"))],
      ["2", version("2", "02", "PUBLISHED", { at: new Date("2025-12-20T08:00:00.000Z") }, null)],
      ["3", version("3", "03", "DRAFT", null, null)],
    ]),
    files: new Map(files.map((entry) => [entry.id, entry])),
    periods: new Map([
      ["1", { id: "1", versionId: "1", productId: "1", effectiveFrom: "2024-01-01", effectiveTo: "2025-01-01", withdrawnAt: null }],
      ["2", { id: "2", versionId: "2", productId: "1", effectiveFrom: "2025-01-01", effectiveTo: null, withdrawnAt: null }],
    ]),
    replacements: new Map([
      [
        "1",
        {
          id: "1",
          versionId: "2",
          languageCode: "tr",
          previousFileId: "3",
          replacementFileId: "5",
          previousFileHash: fileOf("3").fileHash,
          replacementFileHash: fileOf("5").fileHash,
          replacedByUserId: SEED_USER_ID,
          replacedAt: new Date("2026-02-12T10:30:00.000Z"),
          reason: "Sayfa 4'teki dilüsyon tablosu düzeltildi.",
        },
      ],
    ]),
    overrides: new Map([
      [
        "1",
        {
          id: "1",
          lotId: "1",
          versionId: "1",
          reason: "Bu LOT eski formülasyonla üretildi; eski talimat geçerli.",
          createdByUserId: SEED_USER_ID,
          createdAt: new Date("2026-03-15T11:00:00.000Z"),
          isActive: true,
          endedByUserId: null,
          endedAt: null,
          endReason: null,
        },
      ],
    ]),
    audit: [],
    nextDocumentId: 2,
    nextVersionId: 4,
    nextFileId: 6,
    nextPeriodId: 3,
    nextReplacementId: 2,
    nextOverrideId: 2,
    nextAuditId: 1,
  };
}

function isEifuState(value: unknown): value is MockEifuState {
  return typeof value === "object" && value !== null && "documents" in value && "versions" in value && "overrides" in value;
}

/** The state of the mock e-IFU store. The first call makes the seed. */
export function getEifuMock(): MockEifuState {
  const stored: unknown = Reflect.get(globalThis, STATE_KEY);
  if (isEifuState(stored)) {
    return stored;
  }
  const fresh = seed();
  Reflect.set(globalThis, STATE_KEY, fresh);
  return fresh;
}

/** The mock of `appendAudit` (PLT-40): one audit row for a change of the e-IFU module. */
export function appendMockAudit(
  entry: Omit<MockAuditRow, "id" | "occurredAt" | "reason"> & { readonly reason?: string },
  occurredAt: Date,
): void {
  const state = getEifuMock();
  state.audit.push({ ...entry, id: String(state.nextAuditId), occurredAt, reason: entry.reason ?? null });
  state.nextAuditId += 1;
}

/** Puts the seed back. A mock page or a demo calls it to start again. */
export function resetEifuMock(): void {
  Reflect.set(globalThis, STATE_KEY, seed());
}
