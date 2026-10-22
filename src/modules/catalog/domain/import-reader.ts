/**
 * The reader of a LOT import: the input to rows (CAT-60 rules 3, 4 and 10,
 * DEC-051, DEC-052, DEC-053, DEC-055).
 *
 * It reads pasted text, CSV, TSV and text files in UTF-8, or in Windows-1254 when
 * the bytes are not valid UTF-8 (DEC-052), and the first sheet of an XLSX file
 * (`xlsx-sheet.ts`, DEC-055). It finds the columns by the header labels in
 * either language, without letter case and accents. It handles the input with no
 * header (rule 4). It does not read the registered LOTs: the planner does
 * (`import-planner.ts`).
 *
 * This file does no I/O: the bytes of the file are in memory.
 */
import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";
import { IMPORT_MAX_ROWS, type ImportPlanRow, type LotImportInput } from "@/lib/schemas/catalog";

import { cleanTransport } from "./lot-number";
import { type SheetCell, readFirstSheet } from "./xlsx-sheet";

/** One non-blank record of the source: the number of its row, from 1, and its cells. */
interface SourceRecord {
  readonly number: number;
  readonly cells: SheetCell[];
}

/** The text of a cell. A date cell is its date `YYYY-MM-DD` (UTC), because the reader gives the date at midnight UTC. */
function cellText(cell: SheetCell): string {
  if (typeof cell === "string") {
    return cell;
  }
  return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
}

/** One data row of the input, with the three cells that the import uses. */
export interface ImportRow {
  /** The number of the row in the source, from 1. The header row has a number too (the data model of CAT-60). */
  readonly rowNumber: number;
  /** The cells as they arrived, before transport cleanup (CAT-60 rule 10). A row keeps no other cell. */
  readonly rawCells: ImportPlanRow["rawCells"];
  /** The catalog number cell, or the catalog number of the request, or `null` when the cell is absent. */
  readonly catalogNumberCell: string | null;
  readonly lotCell: string;
  /** A text, or a `Date` for the date cell of an XLSX file. `null` when the input has no date column. */
  readonly dateCell: string | Date | null;
}

const CATALOG_LABELS: ReadonlySet<string> = new Set(["katalog no", "catalog no", "catalog number"]);
const LOT_LABELS: ReadonlySet<string> = new Set(["lot", "lot no", "lot number"]);
const DATE_LABELS: ReadonlySet<string> = new Set(["uretim tarihi", "manufacturing date"]);

/** The label of a header cell without letter case, accents and the separators of a label (CAT-60 rule 4). */
function normalizeLabel(cell: string): string {
  return cleanTransport(cell)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[\s_.]+/g, " ")
    .trim();
}

function unreadable(field: string, issue: string): AppError {
  return new AppError("VAL-4006", CODE_MEANINGS["VAL-4006"], { details: [{ field, issue }] });
}

/** The name of the field of the source: `text` or `file`. */
function sourceField(input: LotImportInput): "text" | "file" {
  return input.source.kind;
}

/** UTF-8, or Windows-1254 for a CSV that is not valid UTF-8 (DEC-052). */
function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

/** A ZIP local header starts an XLSX file. */
function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** The delimiter of the first line: a tab, else a semicolon, else a comma (CAT-60 rule 3). */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  if (firstLine.includes("\t")) {
    return "\t";
  }
  if (firstLine.includes(";")) {
    return ";";
  }
  return firstLine.includes(",") ? "," : "\t";
}

/**
 * Splits delimited text into records of cells, with the quotes of CSV: a cell
 * that starts with a quote ends at the next single quote, and `""` is one quote.
 * A record that holds only blank cells is dropped, and the record keeps its
 * number.
 *
 * @returns `null` when a quote is not closed.
 */
function parseDelimited(text: string, delimiter: string): SourceRecord[] | null {
  const records: SourceRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let recordNumber = 1;
  let index = 0;
  const endRecord = (): void => {
    cells.push(cell);
    if (cells.some((value) => cleanTransport(value) !== "")) {
      records.push({ number: recordNumber, cells });
    }
    cells = [];
    cell = "";
    recordNumber += 1;
  };
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === '"' && cell === "") {
      index += 1;
      let closed = false;
      while (index < text.length) {
        const inner = text.charAt(index);
        if (inner === '"') {
          if (text.charAt(index + 1) === '"') {
            cell += '"';
            index += 2;
            continue;
          }
          closed = true;
          index += 1;
          break;
        }
        cell += inner;
        index += 1;
      }
      if (!closed) {
        return null;
      }
      continue;
    }
    if (character === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text.charAt(index + 1) === "\n") {
        index += 1;
      }
      endRecord();
    } else {
      cell += character;
    }
    index += 1;
  }
  if (cell !== "" || cells.length > 0) {
    endRecord();
  }
  return records;
}

interface Columns {
  readonly catalog: number | null;
  readonly lot: number;
  readonly date: number | null;
}

/** The columns by the header labels, or `null` when the first record is no header. */
function findHeaderColumns(first: readonly string[]): { catalog: number | null; lot: number | null; date: number | null } | null {
  const labels = first.map(normalizeLabel);
  const indexOf = (set: ReadonlySet<string>): number | null => {
    const found = labels.findIndex((label) => set.has(label));
    return found === -1 ? null : found;
  };
  const catalog = indexOf(CATALOG_LABELS);
  const lot = indexOf(LOT_LABELS);
  const date = indexOf(DATE_LABELS);
  return catalog === null && lot === null && date === null ? null : { catalog, lot, date };
}

function buildRow(
  rowNumber: number,
  cells: readonly SheetCell[],
  columns: Columns,
  requestCatalogNumber: string | null,
): ImportRow {
  const catalogCell = columns.catalog === null ? null : cellText(cells[columns.catalog] ?? "");
  const lotCell = cellText(cells[columns.lot] ?? "");
  const dateCell = columns.date === null ? null : (cells[columns.date] ?? "");
  return {
    rowNumber,
    rawCells: {
      ...(catalogCell === null ? {} : { catalogNumber: catalogCell }),
      lotNumber: lotCell,
      ...(dateCell === null ? {} : { manufacturingDate: cellText(dateCell) }),
    },
    catalogNumberCell: catalogCell ?? requestCatalogNumber,
    lotCell,
    dateCell,
  };
}

/**
 * The non-blank records of the source: the first sheet of an XLSX file, or the
 * delimited text of the other inputs.
 *
 * @throws AppError `VAL-4006` for a source that is not readable.
 */
async function readRecords(input: LotImportInput, field: "text" | "file"): Promise<SourceRecord[]> {
  if (input.source.kind === "file" && (isZip(input.source.bytes) || /\.xlsx$/i.test(input.source.filename ?? ""))) {
    const sheet = await readFirstSheet(input.source.bytes);
    if (sheet === null) {
      throw unreadable(field, "is not a readable XLSX, CSV, TSV or text file");
    }
    return sheet.filter((record) => record.cells.some((cell) => cleanTransport(cellText(cell)) !== ""));
  }
  const text = input.source.kind === "text" ? input.source.text : decodeBytes(input.source.bytes);
  if (text.includes("\u0000")) {
    throw unreadable(field, "is not a readable XLSX, CSV, TSV or text file");
  }
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  const records = parseDelimited(body, detectDelimiter(body));
  if (records === null) {
    throw unreadable(field, "is not readable: a quote is not closed");
  }
  return records;
}

/**
 * Reads the rows of an input.
 *
 * @throws AppError `VAL-4006` with one `details` entry for each fault: an input
 * that is not readable, a column that is not in the input, no data rows, and
 * more than 5,000 data rows (CAT-60 rule 12, DEC-051).
 */
export async function readImportRows(input: LotImportInput): Promise<ImportRow[]> {
  const field = sourceField(input);
  const requestCatalogNumber = input.catalogNumber === null ? null : cleanTransport(input.catalogNumber);

  const records = await readRecords(input, field);
  const first = records[0];
  if (first === undefined) {
    throw unreadable(field, "has no data rows");
  }

  const header = findHeaderColumns(first.cells.map(cellText));
  const faults: FieldIssue[] = [];
  let columns: Columns;
  let dataRecords: typeof records;
  if (header === null) {
    // No header (CAT-60 rule 4): one column is the LOT, two add the catalog number first, three add the date.
    const width = first.cells.length;
    if (width === 1) {
      if (requestCatalogNumber === null) {
        faults.push({ field: "catalogNumber", issue: "is required when the input has one column" });
      }
      columns = { catalog: null, lot: 0, date: null };
    } else {
      columns = { catalog: 0, lot: 1, date: width >= 3 ? 2 : null };
    }
    dataRecords = records;
  } else {
    if (header.lot === null) {
      faults.push({ field: "lotNumber", issue: "has no column in the input" });
    }
    if (header.catalog === null && requestCatalogNumber === null) {
      faults.push({ field: "catalogNumber", issue: "has no column in the input" });
    }
    columns = { catalog: header.catalog, lot: header.lot ?? 0, date: header.date };
    dataRecords = records.slice(1);
  }
  if (faults.length > 0) {
    throw new AppError("VAL-4006", CODE_MEANINGS["VAL-4006"], { details: faults });
  }
  if (dataRecords.length === 0) {
    throw unreadable(field, "has no data rows");
  }
  if (dataRecords.length > IMPORT_MAX_ROWS) {
    throw unreadable(field, `has more than ${String(IMPORT_MAX_ROWS)} data rows`);
  }
  return dataRecords.map((record) => buildRow(record.number, record.cells, columns, requestCatalogNumber));
}
