/**
 * The planner of a LOT import: one outcome and one reason for each row
 * (CAT-60 rule 6, DEC-044, DEC-046, DEC-047, DEC-049).
 *
 * It takes the rows and a view of the registered LOTs, and it does no I/O: the
 * service gives the view. The preview and the commit run it on the same rows.
 * The commit runs it again inside its transaction (CAT-60 rule 1, AC12, AC13).
 *
 * The checks of one row run in this order, and the first fault gives the
 * outcome: the catalog number (`CATALOG_NUMBER_NOT_FOUND`, `OTHER_PRODUCT`), the
 * LOT number (`LOT_MISSING`, `LOT_FORMAT_INVALID`, `LOT_DATE_INVALID`), the
 * supplied date (`SUPPLIED_DATE_INVALID`), the rows of the same input
 * (`CONFLICTING_ROWS`, `DUPLICATE_ROW`), the registered LOT
 * (`LOT_ALREADY_EXISTS`, `DATE_DIFFERS_FROM_REGISTERED`), the supplied date
 * against the encoded date (`SUPPLIED_DATE_CONFLICT`) and the kit code
 * (`KIT_CODE_MISMATCH`).
 *
 * This file is pure.
 */
import {
  type Format,
  type ImportCounts,
  LOT_NUMBER_MAX,
  type Outcome,
  type Reason,
} from "@/lib/schemas/catalog";

import type { ImportRow } from "./import-reader";
import { kitCodeMatches } from "./kit-code";
import { cleanTransport, readEncodedDate } from "./lot-number";
import { readSuppliedDate } from "./supplied-date";

/** What the planner needs to know about a catalog number. */
export interface PlannerCatalogNumber {
  readonly id: string;
  readonly productId: string;
  readonly kitCodeBase: string | null;
  readonly format: Format | null;
}

/** The registered data that the planner reads. The service builds it from the store. */
export interface PlannerContext {
  /** An import for one product, or `null` for all products (CAT-60 rule 5). */
  readonly productId: string | null;
  /** The catalog number with the exact (cleaned) value, or `null`. */
  readonly findCatalogNumber: (catalogNumber: string) => PlannerCatalogNumber | null;
  /** The manufacturing date of the registered LOT of a catalog number, or `null` when none is registered. */
  readonly findRegisteredLotDate: (catalogNumberId: string, lotNumber: string) => string | null;
}

/** One planned row. A `CREATED` row is the row that the commit writes. */
export interface PlannedRow {
  readonly row: ImportRow;
  readonly catalogNumber: PlannerCatalogNumber | null;
  /** The cleaned LOT number, `null` when the cell is empty. */
  readonly lotNumber: string | null;
  /** The manufacturing date that the LOT gets: the encoded date (DEC-044). `null` when the row has no valid LOT number. */
  readonly manufacturingDate: string | null;
  /** The supplied date, `null` when the row has none or an invalid one. */
  readonly suppliedDate: string | null;
  readonly outcome: Outcome;
  readonly reason: Reason | null;
}

interface Verdict {
  readonly outcome: Outcome;
  readonly reason: Reason | null;
}

const CREATED: Verdict = { outcome: "CREATED", reason: null };

function verdict(outcome: Outcome, reason: Reason): Verdict {
  return { outcome, reason };
}

/** A row that passed the checks of the cells. The checks that need the other rows come next. */
interface Parsed {
  readonly row: ImportRow;
  readonly catalogNumber: PlannerCatalogNumber | null;
  readonly lotNumber: string | null;
  readonly encodedDate: string | null;
  readonly suppliedDate: string | null;
  /** The fault of the cells, or `null` when the cells are right. */
  readonly fault: Verdict | null;
}

function parseRow(row: ImportRow, context: PlannerContext): Parsed {
  const catalogCell = row.catalogNumberCell === null ? "" : cleanTransport(row.catalogNumberCell);
  const catalogNumber = catalogCell === "" ? null : context.findCatalogNumber(catalogCell);
  const lotCell = cleanTransport(row.lotCell);
  const lotNumber = lotCell === "" ? null : lotCell;
  const encoded = lotNumber === null ? null : readEncodedDate(lotNumber);
  const supplied = readSuppliedDate(row.dateCell);

  let fault: Verdict | null = null;
  if (catalogNumber === null) {
    fault = verdict("INVALID_CATALOG_NUMBER", "CATALOG_NUMBER_NOT_FOUND");
  } else if (context.productId !== null && catalogNumber.productId !== context.productId) {
    fault = verdict("INVALID_CATALOG_NUMBER", "OTHER_PRODUCT");
  } else if (lotNumber === null) {
    fault = verdict("INVALID_LOT_FORMAT", "LOT_MISSING");
  } else if (lotNumber.length > LOT_NUMBER_MAX || encoded?.status === "format_invalid") {
    fault = verdict("INVALID_LOT_FORMAT", "LOT_FORMAT_INVALID");
  } else if (encoded?.status === "date_invalid") {
    fault = verdict("INVALID_DATE", "LOT_DATE_INVALID");
  } else if (supplied.status === "invalid") {
    fault = verdict("INVALID_DATE", "SUPPLIED_DATE_INVALID");
  }
  return {
    row,
    catalogNumber,
    lotNumber,
    encodedDate: encoded?.status === "ok" ? encoded.date : null,
    suppliedDate: supplied.status === "ok" ? supplied.date : null,
    fault,
  };
}

/** The date that a row asks for: the supplied date, else the encoded date. */
function requestedDate(parsed: Parsed): string | null {
  return parsed.suppliedDate ?? parsed.encodedDate;
}

/**
 * Plans each row of an input. The result has one entry for each row, in the
 * order of the rows.
 */
export function planRows(rows: readonly ImportRow[], context: PlannerContext): PlannedRow[] {
  const parsed = rows.map((row) => parseRow(row, context));

  // The rows of one input that name the same catalog number and LOT (CAT-60 rule 6).
  const groups = new Map<string, Parsed[]>();
  for (const candidate of parsed) {
    if (candidate.fault !== null || candidate.catalogNumber === null || candidate.lotNumber === null) {
      continue;
    }
    const key = `${candidate.catalogNumber.id}\u0000${candidate.lotNumber}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  return parsed.map((candidate): PlannedRow => {
    const result = decide(candidate, groups, context);
    return {
      row: candidate.row,
      catalogNumber: candidate.catalogNumber,
      lotNumber: candidate.lotNumber,
      manufacturingDate: candidate.encodedDate,
      suppliedDate: candidate.suppliedDate,
      outcome: result.outcome,
      reason: result.reason,
    };
  });
}

function decide(candidate: Parsed, groups: ReadonlyMap<string, readonly Parsed[]>, context: PlannerContext): Verdict {
  if (candidate.fault !== null) {
    return candidate.fault;
  }
  const { catalogNumber, lotNumber, encodedDate } = candidate;
  if (catalogNumber === null || lotNumber === null || encodedDate === null) {
    // Unreachable: a row without a fault has the three values. The guard keeps the types honest.
    return verdict("INVALID_LOT_FORMAT", "LOT_MISSING");
  }

  const same = groups.get(`${catalogNumber.id}\u0000${lotNumber}`) ?? [];
  const dates = new Set(same.map(requestedDate));
  if (dates.size > 1) {
    return verdict("CONFLICT_REVIEW_REQUIRED", "CONFLICTING_ROWS");
  }
  if (same[0] !== candidate) {
    return verdict("ALREADY_EXISTS", "DUPLICATE_ROW");
  }

  const registered = context.findRegisteredLotDate(catalogNumber.id, lotNumber);
  if (registered !== null) {
    return registered === requestedDate(candidate)
      ? verdict("ALREADY_EXISTS", "LOT_ALREADY_EXISTS")
      : verdict("CONFLICT_REVIEW_REQUIRED", "DATE_DIFFERS_FROM_REGISTERED");
  }
  if (candidate.suppliedDate !== null && candidate.suppliedDate !== encodedDate) {
    return verdict("CONFLICT_REVIEW_REQUIRED", "SUPPLIED_DATE_CONFLICT");
  }
  if (!kitCodeMatches(lotNumber, catalogNumber.kitCodeBase, catalogNumber.format)) {
    return verdict("CONFLICT_REVIEW_REQUIRED", "KIT_CODE_MISMATCH");
  }
  return CREATED;
}

/** The counts of a plan. The four counts add up to the rows (`lot_import_counts_add_up`). */
export function countOutcomes(planned: readonly PlannedRow[]): ImportCounts {
  const counts = { created: 0, existing: 0, conflict: 0, invalid: 0 };
  for (const { outcome } of planned) {
    switch (outcome) {
      case "CREATED":
        counts.created += 1;
        break;
      case "ALREADY_EXISTS":
        counts.existing += 1;
        break;
      case "CONFLICT_REVIEW_REQUIRED":
        counts.conflict += 1;
        break;
      case "INVALID_CATALOG_NUMBER":
      case "INVALID_LOT_FORMAT":
      case "INVALID_DATE":
        counts.invalid += 1;
        break;
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }
  return counts;
}
