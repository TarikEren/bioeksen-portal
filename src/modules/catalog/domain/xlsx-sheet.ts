/**
 * The first sheet of an XLSX file as records of cells (CAT-60 rule 3, DEC-055).
 *
 * It reads the file with `exceljs`. A date cell is a `Date` at midnight UTC
 * (DEC-053), and every other cell is a text. The file is in memory and the
 * function does no I/O. The body limit of DEC-051 bounds the file, and this
 * file bounds what the file unpacks to, because a ZIP file can hold far more
 * than its size shows.
 *
 * `exceljs` unpacks every entry in full and builds every row and cell of every
 * sheet before the caller can count the rows (R-064). So before the load, this
 * file unpacks each entry itself with a hard limit on the output, and counts the
 * rows and the cells of the worksheets. The sizes that the ZIP directory states
 * count for nothing: the uploader writes them.
 */
import { inflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";

/** One cell: the text of the cell, or the `Date` of a date cell. */
export type SheetCell = string | Date;

/** One non-blank row of the sheet. `number` is the number of the row in the sheet, from 1. */
export interface SheetRecord {
  readonly number: number;
  readonly cells: SheetCell[];
}

/** The result of `readFirstSheet`. `too-many-rows`: the worksheets hold far more rows than the caller takes. */
export type SheetReading =
  | { readonly kind: "sheet"; readonly records: SheetRecord[] }
  | { readonly kind: "unreadable" }
  | { readonly kind: "too-many-rows" };

/** The most that the entries of the file may unpack to. The file is 5 MiB at most, so this allows a ratio of 12. */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
/** The most entries that the file may hold. An XLSX file holds a few dozen. */
const MAX_ENTRIES = 1_000;
/** The most columns that the reader takes from a row. The import uses three. */
const MAX_COLUMNS = 100;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
/** A size or an offset with this value is in a ZIP64 record. A file of 5 MiB never needs one. */
const ZIP64_MARK = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
/** A worksheet part, which `exceljs` builds row by row and cell by cell. */
const WORKSHEET_PART = /^xl\/worksheets\/[^/]+\.xml$/;

/** The offset of the end-of-central-directory record, or -1. The record is 22 bytes, and a comment of up to 65,535 bytes follows it. */
function findEndOfCentralDirectory(zip: Buffer): number {
  const lowest = Math.max(0, zip.byteLength - 22 - 0xffff);
  for (let end = zip.byteLength - 22; end >= lowest; end -= 1) {
    if (zip.readUInt32LE(end) === END_OF_CENTRAL_DIRECTORY) {
      return end;
    }
  }
  return -1;
}

/** The count of the elements `name` in the XML: `<name` and then a space, `>` or `/`. A prefixed name is not counted: `exceljs` does not build it. */
function countElements(xml: Buffer, name: string): number {
  const open = Buffer.from(`<${name}`, "utf8");
  let count = 0;
  for (let at = xml.indexOf(open); at !== -1; at = xml.indexOf(open, at + open.byteLength)) {
    const next = xml[at + open.byteLength];
    if (next === 0x20 || next === 0x09 || next === 0x0a || next === 0x0d || next === 0x3e || next === 0x2f) {
      count += 1;
    }
  }
  return count;
}

/**
 * Unpacks each entry of the ZIP file with a hard limit on the output, and checks
 * what `exceljs` would build. Each entry is unpacked from its local header, with
 * the compressed size of the central directory, as JSZip in `exceljs` does. The
 * real output of all the entries together is at most `MAX_UNPACKED_BYTES`, and
 * each entry must unpack to its stated size, which JSZip requires too. The
 * worksheets together may hold at most twice the rows that the caller takes (a
 * header and blank rows with a format are rows too), and at most `MAX_COLUMNS`
 * cells for each row that the caller takes.
 */
function inspectEntries(bytes: Uint8Array, maxRows: number): SheetReading["kind"] {
  const zip = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (zip.byteLength < 22) {
    return "unreadable";
  }
  const end = findEndOfCentralDirectory(zip);
  if (end === -1) {
    return "unreadable";
  }
  const entries = zip.readUInt16LE(end + 10);
  if (entries > MAX_ENTRIES) {
    return "unreadable";
  }
  let offset = zip.readUInt32LE(end + 16);
  let unpacked = 0;
  let rows = 0;
  let cells = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > zip.byteLength || zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER) {
      return "unreadable";
    }
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const statedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, Math.min(zip.byteLength, offset + 46 + nameLength));
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);

    // An XLSX file has no encrypted entry, no method other than stored or deflated, and no ZIP64 record.
    const encrypted = (flags & 0x1) !== 0;
    const zip64 = compressedSize === ZIP64_MARK || statedSize === ZIP64_MARK || localOffset === ZIP64_MARK;
    if (encrypted || zip64 || (method !== STORED && method !== DEFLATED)) {
      return "unreadable";
    }
    if (localOffset + 30 > zip.byteLength || zip.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      return "unreadable";
    }
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > zip.byteLength) {
      return "unreadable";
    }
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    let content: Buffer;
    if (method === STORED) {
      content = data;
    } else {
      try {
        // Over the limit, the inflate stops and throws: it never holds more than the limit.
        content = inflateRawSync(data, { maxOutputLength: Math.max(1, MAX_UNPACKED_BYTES - unpacked) });
      } catch {
        return "unreadable";
      }
    }
    unpacked += content.byteLength;
    if (content.byteLength !== statedSize || unpacked > MAX_UNPACKED_BYTES) {
      return "unreadable";
    }
    if (WORKSHEET_PART.test(name)) {
      rows += countElements(content, "row");
      cells += countElements(content, "c");
    }
  }
  if (rows > 2 * (maxRows + 1)) {
    return "too-many-rows";
  }
  if (cells > (maxRows + 1) * MAX_COLUMNS) {
    return "unreadable";
  }
  return "sheet";
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
 * `maxRows` is the most data rows that the caller takes; the caller still counts
 * the rows that it gets.
 *
 * @returns `unreadable` when the bytes are not a readable workbook with a sheet,
 * or unpack to more than the reader accepts; `too-many-rows` when the worksheets
 * hold far more rows than `maxRows`.
 */
export async function readFirstSheet(bytes: Uint8Array, maxRows: number): Promise<SheetReading> {
  const inspection = inspectEntries(bytes, maxRows);
  if (inspection !== "sheet") {
    return { kind: inspection };
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  } catch {
    return { kind: "unreadable" };
  }
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    return { kind: "unreadable" };
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
  return { kind: "sheet", records };
}
