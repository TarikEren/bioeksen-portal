/**
 * The mock data of the catalog module (stage B2, step 2 of `crisis_mode.md`).
 *
 * It holds three products, two catalog numbers under `BS-GHPV-L`, five LOTs
 * (one with a date conflict, one with a manual correction), one import with its
 * rows, and the audit rows that the mock services write. Step 4 moves them to
 * the database and deletes this file and each `MOCK:` comment.
 *
 * | Id | Product | Status | Notes |
 * |---|---|---|---|
 * | 1 | `BS-GHPV-L` | `IVD` | kit code base `GHPV`; catalog numbers 1 `BS-GHPV-L-100` and 2 `BS-GHPV-L-25`, both `VCAP`; 5 LOTs, so the stem is locked |
 * | 2 | `BS-STI-L` | `IVD` | no catalog number, no LOT: every field can change |
 * | 3 | `BS-STI-L` | `RUO` | no catalog number, no LOT |
 *
 * LOT 3 (`B2601201530GHPVV`) has a date conflict: the number encodes 2026-01-20
 * and the supplied date is 2026-01-21. LOT 5 has a manual correction. Import 1
 * has six rows, one for each kind of outcome that the report shows.
 *
 * The state is a module-level singleton that also lives on `globalThis`, because
 * a route handler, a server action and a page can load this module as separate
 * instances in `next dev`. Only mock code does this.
 */
import "server-only";

import { createHash } from "node:crypto";

import type {
  Format,
  ImportPlanRow,
  ImportStatus,
  LocalizedDescription,
  LocalizedName,
  ManufacturingDateSource,
  Outcome,
  Reason,
  RegulatoryStatus,
} from "@/lib/schemas/catalog";

export interface MockProduct {
  readonly id: string;
  internalCode: string;
  name: LocalizedName;
  description: LocalizedDescription | null;
  regulatoryStatus: RegulatoryStatus;
  kitCodeBase: string | null;
  isActive: boolean;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface MockCatalogNumber {
  readonly id: string;
  productId: string;
  catalogNumber: string;
  packSize: string | null;
  format: Format | null;
  isActive: boolean;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface MockLot {
  readonly id: string;
  readonly catalogNumberId: string;
  readonly lotNumber: string;
  manufacturingDate: string;
  manufacturingDateSource: ManufacturingDateSource;
  readonly suppliedManufacturingDate: string | null;
  readonly expiryDate: string | null;
  hasDateConflict: boolean;
  readonly lotImportId: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface MockLotImport {
  readonly id: string;
  readonly sourceFilename: string | null;
  readonly sourceHash: string;
  readonly productId: string | null;
  readonly uploadedByUserId: string;
  status: ImportStatus;
  rowCount: number;
  createdCount: number;
  existingCount: number;
  conflictCount: number;
  invalidCount: number;
  failureCode: string | null;
  readonly createdAt: Date;
  completedAt: Date | null;
}

export interface MockLotImportRow {
  readonly id: string;
  readonly lotImportId: string;
  readonly rowNumber: number;
  readonly outcome: Outcome;
  readonly reason: Reason | null;
  readonly rawCells: ImportPlanRow["rawCells"];
  readonly lotId: string | null;
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

export interface MockCatalogState {
  readonly products: Map<string, MockProduct>;
  readonly catalogNumbers: Map<string, MockCatalogNumber>;
  readonly lots: Map<string, MockLot>;
  readonly imports: Map<string, MockLotImport>;
  readonly importRows: MockLotImportRow[];
  readonly audit: MockAuditRow[];
  nextProductId: number;
  nextCatalogNumberId: number;
  nextLotId: number;
  nextImportId: number;
  nextImportRowId: number;
  nextAuditId: number;
}

const STATE_KEY = Symbol.for("bioeksen.mock.catalog");

/** The id of the user that uploaded the mock import. It is the IFU Manager of the B1 mock. */
const SEED_USER_ID = "2";

function seed(): MockCatalogState {
  const created = new Date("2026-10-05T09:00:00.000Z");
  const product = (
    id: string,
    regulatoryStatus: RegulatoryStatus,
    internalCode: string,
    name: LocalizedName,
    kitCodeBase: string | null,
  ): MockProduct => ({
    id,
    internalCode,
    name,
    description: null,
    regulatoryStatus,
    kitCodeBase,
    isActive: true,
    createdAt: created,
    updatedAt: created,
  });
  const catalogNumber = (id: string, catalogNumber: string, packSize: string): MockCatalogNumber => ({
    id,
    productId: "1",
    catalogNumber,
    packSize,
    format: "VCAP",
    isActive: true,
    createdAt: created,
    updatedAt: created,
  });
  const lot = (
    id: string,
    catalogNumberId: string,
    lotNumber: string,
    manufacturingDate: string,
    source: ManufacturingDateSource,
    options: { supplied?: string; expiry?: string; conflict?: boolean; importId?: string } = {},
  ): MockLot => ({
    id,
    catalogNumberId,
    lotNumber,
    manufacturingDate,
    manufacturingDateSource: source,
    suppliedManufacturingDate: options.supplied ?? null,
    expiryDate: options.expiry ?? null,
    hasDateConflict: options.conflict ?? false,
    lotImportId: options.importId ?? null,
    createdAt: created,
    updatedAt: created,
  });

  const row = (
    id: string,
    rowNumber: number,
    outcome: Outcome,
    reason: Reason | null,
    rawCells: ImportPlanRow["rawCells"],
    lotId: string | null,
  ): MockLotImportRow => ({ id, lotImportId: "1", rowNumber, outcome, reason, rawCells, lotId });

  return {
    products: new Map([
      ["1", product("1", "IVD", "BS-GHPV-L", { tr: "HPV Genotipleme Kiti", en: "HPV Genotyping Kit" }, "GHPV")],
      ["2", product("2", "IVD", "BS-STI-L", { tr: "STI Paneli", en: "STI Panel" }, null)],
      ["3", product("3", "RUO", "BS-STI-L", { tr: "STI Paneli (araştırma)", en: "STI Panel (research)" }, null)],
    ]),
    catalogNumbers: new Map([
      ["1", catalogNumber("1", "BS-GHPV-L-100", "100")],
      ["2", catalogNumber("2", "BS-GHPV-L-25", "25")],
    ]),
    lots: new Map([
      ["1", lot("1", "1", "B2603091224GHPVV", "2026-03-09", "PARSED_FROM_LOT", { expiry: "2028-03-08" })],
      ["2", lot("2", "1", "B2509150101GHPVV", "2025-09-15", "SUPPLIED", { supplied: "2025-09-15", expiry: "2027-09-14", importId: "1" })],
      ["3", lot("3", "1", "B2601201530GHPVV", "2026-01-20", "PARSED_FROM_LOT", { supplied: "2026-01-21", conflict: true })],
      ["4", lot("4", "2", "B2602101200GHPVV", "2026-02-10", "PARSED_FROM_LOT", { importId: "1" })],
      ["5", lot("5", "2", "B2511041000GHPVV", "2025-11-05", "MANUAL_CORRECTION")],
    ]),
    imports: new Map([
      [
        "1",
        {
          id: "1",
          sourceFilename: "lots-2026-03.csv",
          sourceHash: createHash("sha256").update("mock import 1").digest("hex"),
          productId: null,
          uploadedByUserId: SEED_USER_ID,
          status: "COMPLETED",
          rowCount: 6,
          createdCount: 2,
          existingCount: 1,
          conflictCount: 1,
          invalidCount: 2,
          failureCode: null,
          createdAt: created,
          completedAt: created,
        },
      ],
    ]),
    importRows: [
      row("1", 1, "CREATED", null, { catalogNumber: "BS-GHPV-L-100", lotNumber: "B2509150101GHPVV", manufacturingDate: "2025-09-15" }, "2"),
      row("2", 2, "CREATED", null, { catalogNumber: "BS-GHPV-L-25", lotNumber: "B2602101200GHPVV", manufacturingDate: "" }, "4"),
      row("3", 3, "ALREADY_EXISTS", "LOT_ALREADY_EXISTS", { catalogNumber: "BS-GHPV-L-100", lotNumber: "B2603091224GHPVV", manufacturingDate: "2026-03-09" }, null),
      row("4", 4, "CONFLICT_REVIEW_REQUIRED", "DATE_DIFFERS_FROM_REGISTERED", { catalogNumber: "BS-GHPV-L-100", lotNumber: "B2603091224GHPVV", manufacturingDate: "2026-03-10" }, null),
      row("5", 5, "INVALID_CATALOG_NUMBER", "CATALOG_NUMBER_NOT_FOUND", { catalogNumber: "BS-XXX-L-100", lotNumber: "B2603091224GHPVV", manufacturingDate: "" }, null),
      row("6", 6, "INVALID_LOT_FORMAT", "LOT_FORMAT_INVALID", { catalogNumber: "BS-GHPV-L-100", lotNumber: "b2603091224ghpvv", manufacturingDate: "" }, null),
    ],
    audit: [],
    nextProductId: 4,
    nextCatalogNumberId: 3,
    nextLotId: 6,
    nextImportId: 2,
    nextImportRowId: 7,
    nextAuditId: 1,
  };
}

/** The state of the mock catalog. The first call makes the seed. */
export function getCatalogMock(): MockCatalogState {
  const stored: unknown = Reflect.get(globalThis, STATE_KEY);
  if (isCatalogState(stored)) {
    return stored;
  }
  const fresh = seed();
  Reflect.set(globalThis, STATE_KEY, fresh);
  return fresh;
}

function isCatalogState(value: unknown): value is MockCatalogState {
  return typeof value === "object" && value !== null && "products" in value && "audit" in value && "importRows" in value;
}

/** The mock of `appendAudit` (PLT-40): one audit row for a change of the catalog. */
export function appendMockAudit(
  entry: Omit<MockAuditRow, "id" | "occurredAt" | "reason"> & { readonly reason?: string },
  occurredAt: Date,
): void {
  const state = getCatalogMock();
  state.audit.push({
    ...entry,
    id: String(state.nextAuditId),
    occurredAt,
    reason: entry.reason ?? null,
  });
  state.nextAuditId += 1;
}

/** Puts the seed back. A mock page or a demo calls it to start again. */
export function resetCatalogMock(): void {
  Reflect.set(globalThis, STATE_KEY, seed());
}
