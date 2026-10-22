/**
 * The first sheet of an XLSX file as records of cells (CAT-60 rule 3, DEC-055).
 *
 * It reads the file with `exceljs`. A date cell is a `Date` at midnight UTC
 * (DEC-053), and every other cell is a text. The file is in memory and the
 * function does no I/O. The body limit of DEC-051 bounds the file, and this
 * file bounds what the file unpacks to, because a ZIP file can hold far more
 * than its size shows.
 */
import ExcelJS from "exceljs";

/** One cell: the text of the cell, or the `Date` of a date cell. */
export type SheetCell = string | Date;

/** One non-blank row of the sheet. `number` is the number of the row in the sheet, from 1. */
export interface SheetRecord {
  readonly number: number;
  readonly cells: SheetCell[];
}

/** The most that the entries of the file may unpack to. The file is 5 MiB at most, so this allows a ratio of 12. */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
/** The most entries that the file may hold. An XLSX file holds a few dozen. */
const MAX_ENTRIES = 1_000;
/** The most columns that the reader takes from a row. The import uses three. */
const MAX_COLUMNS = 100;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;

/**
 * Whether the central directory of the ZIP file shows a size that the reader
 * accepts. The directory states the size of each entry before it unpacks.
 * `exceljs` checks the stated size against the real one while it unpacks.
 */
function isUnpackedSizeBounded(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The record is 22 bytes, and a comment of up to 65,535 bytes follows it.
  let end = bytes.byteLength - 22;
  const lowest = Math.max(0, end - 0xffff);
  while (end >= lowest && view.getUint32(end, true) !== END_OF_CENTRAL_DIRECTORY) {
    end -= 1;
  }
  if (end < lowest) {
    return false;
  }
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (entries > MAX_ENTRIES) {
    return false;
  }
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_DIRECTORY_HEADER) {
      return false;
    }
    total += view.getUint32(offset + 24, true);
    if (total > MAX_UNPACKED_BYTES) {
      return false;
    }
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return true;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** The cell of a sheet value. A formula gives its result, a rich text its runs, a hyperlink its text, an error nothing. */
function toCell(value: ExcelJS.CellValue): SheetCell {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value;
  }
  if ("richText" in value) {
    return value.richText.map((run) => run.text).join("");
  }
  if ("error" in value) {
    return "";
  }
  if ("hyperlink" in value) {
    return value.text;
  }
  const result = value.result;
  if (result === undefined) {
    return "";
  }
  return isObject(result) && !(result instanceof Date) ? "" : toCell(result);
}

/**
 * Reads the first sheet. A row with no cell is dropped, and the other rows keep
 * their numbers. A cell with only spaces stays: the reader of the import cleans it.
 *
 * @returns `null` when the bytes are not a readable workbook with a sheet.
 */
export async function readFirstSheet(bytes: Uint8Array): Promise<SheetRecord[] | null> {
  if (!isUnpackedSizeBounded(bytes)) {
    return null;
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  } catch {
    return null;
  }
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    return null;
  }
  const records: SheetRecord[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const width = Math.min(Math.max(sheet.columnCount, row.cellCount), MAX_COLUMNS);
    const cells: SheetCell[] = [];
    for (let column = 1; column <= width; column += 1) {
      cells.push(toCell(row.getCell(column).value));
    }
    // A trailing blank cell is formatting, not data: a one-column sheet has one cell.
    while (cells.length > 0 && cells[cells.length - 1] === "") {
      cells.pop();
    }
    if (cells.length > 0) {
      records.push({ number: rowNumber, cells });
    }
  });
  return records;
}
