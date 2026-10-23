/**
 * The first sheet of an XLSX file as records of cells (CAT-60 rule 3, DEC-055).
 *
 * It reads the file with `exceljs`. A date cell is a `Date` at midnight UTC
 * (DEC-053), and every other cell is a text. The file is in memory and the
 * function does no I/O. The body limit of DEC-051 bounds the file, and this
 * file bounds what the file unpacks to, because a ZIP file can hold far more
 * than its size shows.
 *
 * `exceljs` unpacks every entry in full, and builds every row and cell of every
 * sheet, also the cells of a merge, a data validation or a column range, before
 * the caller can count the rows (R-064). So `exceljs` never gets the file of the
 * upload. This file reads the ZIP itself and unpacks only the parts that the
 * first sheet needs, each with a hard limit on the output: the workbook and its
 * relations, the first worksheet, the shared strings and the styles. The sizes
 * that the ZIP directory states count for nothing: the uploader writes them. It
 * counts the rows and the cells of the `sheetData` of the first worksheet, the
 * cells of its merged ranges, and the strings, and checks that each row and
 * cell address is inside the sheet of Excel. Then it gives `exceljs` a new
 * workbook made of these parts only: a worksheet that holds only that
 * `sheetData` and its merged ranges, so `exceljs` builds exactly the rows and
 * the cells that were counted. A merge still gives each of its cells the value
 * of its first cell, as before (owner answer 2026-10-23).
 */
import { crc32, inflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";

/** One cell: the text of the cell, or the `Date` of a date cell. */
export type SheetCell = string | Date;

/** One non-blank row of the sheet. `number` is the number of the row in the sheet, from 1. */
export interface SheetRecord {
  readonly number: number;
  readonly cells: SheetCell[];
}

/** The result of `readFirstSheet`. `too-many-rows`: the first sheet holds far more rows than the caller takes. */
export type SheetReading =
  | { readonly kind: "sheet"; readonly records: SheetRecord[] }
  | { readonly kind: "unreadable" }
  | { readonly kind: "too-many-rows" };

/** The most that the parts of the file may unpack to together. The file is 5 MiB at most, so this allows a ratio of 12. */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
/** The most that the workbook part or its relations may unpack to. Each is a few kB. */
const MAX_INDEX_PART_BYTES = 1024 * 1024;
/** The most that the styles may unpack to. A workbook with much formatting has styles of a few hundred kB. */
const MAX_STYLES_BYTES = 8 * 1024 * 1024;
/** The most entries that the file may hold. An XLSX file holds a few dozen. */
const MAX_ENTRIES = 1_000;
/** The most columns that the reader takes from a row. The import uses three. */
const MAX_COLUMNS = 100;
/** The last row and the last column (`XFD`) of a sheet of Excel. */
const MAX_ROW_NUMBER = 1_048_576;
const MAX_COLUMN_NUMBER = 16_384;
/**
 * The most characters that the records may hold together. Many cells can show
 * one shared string, so the records can hold far more text than the file
 * unpacks to; they may hold no more than the parts could hold with no sharing.
 */
const MAX_TEXT_CHARACTERS = MAX_UNPACKED_BYTES;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
/** A size or an offset with this value is in a ZIP64 record. A file of 5 MiB never needs one. */
const ZIP64_MARK = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
/** The flag of a name in UTF-8. */
const UTF8_NAMES = 0x0800;

const WORKBOOK_PART = "xl/workbook.xml";
const WORKBOOK_RELATIONS_PART = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS_PART = "xl/sharedStrings.xml";
const STYLES_PART = "xl/styles.xml";
/** The name of a worksheet part, as `exceljs` finds it. */
const WORKSHEET_NAME = /xl\/worksheets\/sheet(\d+)[.]xml/;

const MAIN_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** One entry of the central directory. */
interface ZipEntry {
  readonly method: number;
  readonly compressedSize: number;
  readonly statedSize: number;
  readonly dataStart: number;
}

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

/**
 * The entries of the ZIP file by name, or `null` when the directory is not one
 * that the reader accepts. A leading `/` of a name is removed, as `exceljs`
 * does. An XLSX file has no encrypted entry, no method other than stored or
 * deflated, no ZIP64 record and no name twice.
 */
function readDirectory(zip: Buffer): Map<string, ZipEntry> | null {
  if (zip.byteLength < 22) {
    return null;
  }
  const end = findEndOfCentralDirectory(zip);
  if (end === -1) {
    return null;
  }
  const count = zip.readUInt16LE(end + 10);
  if (count > MAX_ENTRIES) {
    return null;
  }
  const entries = new Map<string, ZipEntry>();
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > zip.byteLength || zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER) {
      return null;
    }
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const statedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const localOffset = zip.readUInt32LE(offset + 42);
    if (offset + 46 + nameLength > zip.byteLength) {
      return null;
    }
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength).replace(/^\//, "");
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);

    const encrypted = (flags & 0x1) !== 0;
    const zip64 = compressedSize === ZIP64_MARK || statedSize === ZIP64_MARK || localOffset === ZIP64_MARK;
    if (encrypted || zip64 || (method !== STORED && method !== DEFLATED) || entries.has(name)) {
      return null;
    }
    if (localOffset + 30 > zip.byteLength || zip.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      return null;
    }
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > zip.byteLength) {
      return null;
    }
    entries.set(name, { method, compressedSize, statedSize, dataStart });
  }
  return entries;
}

/**
 * Unpacks one entry with a hard limit on the output. Over the limit, the inflate
 * stops and throws, so it never holds more than the limit.
 *
 * @returns The bytes, or `null` when the entry passes the limit or does not unpack to its stated size.
 */
function unpack(zip: Buffer, entry: ZipEntry, limit: number): Buffer | null {
  if (limit <= 0) {
    return null;
  }
  const data = zip.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  let content: Buffer;
  try {
    content = entry.method === STORED ? data : inflateRawSync(data, { maxOutputLength: limit });
  } catch {
    return null;
  }
  return content.byteLength === entry.statedSize && content.byteLength <= limit ? content : null;
}

/** The count of the elements `name` in the XML: `<name` and then a space, `>` or `/`. A prefixed name is not counted: `exceljs` does not build it. */
function countElements(xml: string, name: string): number {
  const open = `<${name}`;
  let count = 0;
  for (let at = xml.indexOf(open); at !== -1; at = xml.indexOf(open, at + open.length)) {
    const next = xml.charCodeAt(at + open.length);
    if (next === 0x20 || next === 0x09 || next === 0x0a || next === 0x0d || next === 0x3e || next === 0x2f) {
      count += 1;
    }
  }
  return count;
}

/** The opening tags of the elements `name`, as `exceljs` reads them: with no prefix. */
function openingTags(xml: string, name: string): string[] {
  return xml.match(new RegExp(`<${name}\\s[^>]*>`, "g")) ?? [];
}

/** The value of an attribute of an opening tag, or `undefined`. */
function attributeOf(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return match === null ? undefined : (match[1] ?? match[2]);
}

/**
 * The name of the part of the first worksheet, as `exceljs` finds it: the first
 * `sheet` of the workbook whose relation names a worksheet part.
 */
function firstWorksheetName(workbook: string, relations: string, entries: Map<string, ZipEntry>): string | null {
  const targets = new Map<string, string>();
  for (const tag of openingTags(relations, "Relationship")) {
    const id = attributeOf(tag, "Id");
    const target = attributeOf(tag, "Target");
    if (id !== undefined && target !== undefined) {
      targets.set(id, target);
    }
  }
  const sheets = openingTags(workbook, "sheet");
  const sheetIds = sheets.map((tag) => attributeOf(tag, "sheetId") ?? "");
  // `exceljs` keeps the sheets by their id and leaves out the id 0, so an id
  // twice or one that is not a positive number makes "the first sheet" unclear.
  if (sheetIds.some((id) => !/^[1-9]\d{0,8}$/.test(id)) || new Set(sheetIds).size !== sheetIds.length) {
    return null;
  }
  for (const tag of sheets) {
    const target = targets.get(attributeOf(tag, "r:id") ?? "");
    const name = target === undefined ? null : `xl/${target.replace(/^(\s|\/xl\/)+/, "")}`;
    if (name !== null && WORKSHEET_NAME.test(name) && entries.has(name)) {
      return name;
    }
  }
  return null;
}

/** The `sheetData` element of a worksheet, and where it starts and ends in the worksheet. */
interface SheetDataSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The `sheetData` element of a worksheet: `<sheetData/>` when the worksheet has
 * none, `null` when it is not closed.
 */
function sheetDataOf(worksheet: string): SheetDataSpan | null {
  const start = worksheet.search(/<sheetData[\s/>]/);
  if (start === -1) {
    return { text: "<sheetData/>", start: 0, end: 0 };
  }
  const openEnd = worksheet.indexOf(">", start);
  if (openEnd === -1) {
    return null;
  }
  if (worksheet[openEnd - 1] === "/") {
    return { text: worksheet.slice(start, openEnd + 1), start, end: openEnd + 1 };
  }
  const close = worksheet.indexOf("</sheetData>", openEnd);
  if (close === -1) {
    return null;
  }
  const end = close + "</sheetData>".length;
  return { text: worksheet.slice(start, end), start, end };
}

/**
 * The row and the column of an address such as `B12` (a `$` mark is allowed),
 * or `null` when it is not an address inside the sheet of Excel.
 */
function cellAddress(text: string): { readonly row: number; readonly column: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(text);
  if (match === null) {
    return null;
  }
  const [, letters = "", digits = ""] = match;
  let column = 0;
  for (const letter of letters.toUpperCase()) {
    column = column * 26 + letter.charCodeAt(0) - 64;
  }
  const row = Number(digits);
  return row >= 1 && row <= MAX_ROW_NUMBER && column <= MAX_COLUMN_NUMBER ? { row, column } : null;
}

/**
 * Whether each row number and each cell address of the `sheetData` is inside
 * the sheet of Excel. `exceljs` keeps the rows and the cells in arrays by their
 * numbers and walks those arrays, so one row with the number 4,294,967,295
 * blocks the process for minutes (R-064).
 */
function addressesInSheet(sheetData: string): boolean {
  for (const tag of openingTags(sheetData, "row")) {
    const number = attributeOf(tag, "r");
    if (number !== undefined && !(/^\d{1,7}$/.test(number) && Number(number) >= 1 && Number(number) <= MAX_ROW_NUMBER)) {
      return false;
    }
  }
  for (const tag of openingTags(sheetData, "c")) {
    const address = attributeOf(tag, "r");
    if (address !== undefined && cellAddress(address) === null) {
      return false;
    }
  }
  return true;
}

/**
 * The merged ranges of the worksheet, outside its `sheetData`, as `exceljs`
 * reads them, with the count of the cells that they cover. `null` when a range
 * is not inside the sheet of Excel.
 */
function mergedRanges(worksheet: string, sheetData: SheetDataSpan): { readonly ranges: string[]; readonly cells: number } | null {
  const outside = worksheet.slice(0, sheetData.start) + worksheet.slice(sheetData.end);
  const start = outside.search(/<mergeCells[\s>]/);
  if (start === -1) {
    return { ranges: [], cells: 0 };
  }
  const close = outside.indexOf("</mergeCells>", start);
  const section = close === -1 ? outside.slice(start) : outside.slice(start, close);
  const ranges: string[] = [];
  let cells = 0;
  for (const tag of openingTags(section, "mergeCell")) {
    const [first = "", last = first] = (attributeOf(tag, "ref") ?? "").split(":");
    const from = cellAddress(first);
    const to = cellAddress(last);
    if (from === null || to === null) {
      return null;
    }
    ranges.push(`${first}:${last}`);
    cells += (Math.abs(to.row - from.row) + 1) * (Math.abs(to.column - from.column) + 1);
  }
  return { ranges, cells };
}

/** A ZIP file that stores the parts as they are, with no compression. */
function storedZip(parts: ReadonlyArray<readonly [string, Buffer]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of parts) {
    const nameBytes = Buffer.from(name, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(STORED, 8);
    local.writeUInt16LE(0x21, 12); // 1980-01-01
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.byteLength, 18);
    local.writeUInt32LE(content.byteLength, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(STORED, 10);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.byteLength, 20);
    central.writeUInt32LE(content.byteLength, 24);
    central.writeUInt16LE(nameBytes.byteLength, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, content);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.byteLength + content.byteLength;
  }
  const directorySize = centrals.reduce((total, part) => total + part.byteLength, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/**
 * The workbook that `exceljs` gets: the first worksheet with only its
 * `sheetData`, the shared strings, the styles and the date system of the
 * upload, and nothing else. It is checked against the limits first: at most
 * twice the rows that the caller takes in the `sheetData` (a header and blank
 * rows with a format are rows too), at most `MAX_COLUMNS` cells for each row
 * that the caller takes, and as many strings and runs of rich text.
 */
function boundedWorkbook(bytes: Uint8Array, maxRows: number): Buffer | "unreadable" | "too-many-rows" {
  const zip = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readDirectory(zip);
  const workbookEntry = entries?.get(WORKBOOK_PART);
  const relationsEntry = entries?.get(WORKBOOK_RELATIONS_PART);
  if (entries === null || entries === undefined || workbookEntry === undefined || relationsEntry === undefined) {
    return "unreadable";
  }
  const workbook = unpack(zip, workbookEntry, MAX_INDEX_PART_BYTES)?.toString("utf8");
  const relations = unpack(zip, relationsEntry, MAX_INDEX_PART_BYTES)?.toString("utf8");
  if (workbook === undefined || relations === undefined) {
    return "unreadable";
  }
  const worksheetName = firstWorksheetName(workbook, relations, entries);
  const worksheetEntry = worksheetName === null ? undefined : entries.get(worksheetName);
  if (worksheetEntry === undefined) {
    return "unreadable";
  }

  let budget = MAX_UNPACKED_BYTES;
  const worksheet = unpack(zip, worksheetEntry, budget);
  if (worksheet === null) {
    return "unreadable";
  }
  budget -= worksheet.byteLength;
  const worksheetText = worksheet.toString("utf8");
  const sheetData = sheetDataOf(worksheetText);
  if (sheetData === null) {
    return "unreadable";
  }
  const cellLimit = (maxRows + 1) * MAX_COLUMNS;
  if (countElements(sheetData.text, "row") > 2 * (maxRows + 1)) {
    return "too-many-rows";
  }
  // A merge gives each cell of its range the value of its first cell, so
  // `exceljs` makes a cell for each of them: they count as cells (R-064).
  const merges = mergedRanges(worksheetText, sheetData);
  if (merges === null || countElements(sheetData.text, "c") + merges.cells > cellLimit || !addressesInSheet(sheetData.text)) {
    return "unreadable";
  }
  // The runs of rich text in a cell (`<is>`) count with the strings.
  let strings = countElements(sheetData.text, "r");

  const parts: Array<readonly [string, Buffer]> = [];
  const stringsEntry = entries.get(SHARED_STRINGS_PART);
  if (stringsEntry !== undefined) {
    const sharedStrings = unpack(zip, stringsEntry, budget);
    if (sharedStrings === null) {
      return "unreadable";
    }
    budget -= sharedStrings.byteLength;
    const text = sharedStrings.toString("utf8");
    strings += countElements(text, "si") + countElements(text, "r");
    parts.push([SHARED_STRINGS_PART, sharedStrings]);
  }
  if (strings > 2 * cellLimit) {
    return "unreadable";
  }
  const stylesEntry = entries.get(STYLES_PART);
  if (stylesEntry !== undefined) {
    const styles = unpack(zip, stylesEntry, Math.min(budget, MAX_STYLES_BYTES));
    if (styles === null) {
      return "unreadable";
    }
    parts.push([STYLES_PART, styles]);
  }

  // `exceljs` turns the 1904 date system on only for the value `1`.
  const date1904 = openingTags(workbook, "workbookPr").some((tag) => attributeOf(tag, "date1904") === "1");
  const contentTypes = [
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `</Types>`,
  ].join("");
  const packageRelations =
    `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}">` +
    `<Relationship Id="rId1" Type="${RELATIONSHIP_NAMESPACE}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const newWorkbook =
    `<workbook xmlns="${MAIN_NAMESPACE}" xmlns:r="${RELATIONSHIP_NAMESPACE}">` +
    (date1904 ? `<workbookPr date1904="1"/>` : "") +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const newRelations =
    `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}">` +
    `<Relationship Id="rId1" Type="${RELATIONSHIP_NAMESPACE}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;
  // Each range passed `cellAddress`, so it holds only letters, digits, `$` and `:`.
  const newMerges =
    merges.ranges.length === 0
      ? ""
      : `<mergeCells count="${String(merges.ranges.length)}">${merges.ranges.map((range) => `<mergeCell ref="${range}"/>`).join("")}</mergeCells>`;
  const newWorksheet = `<worksheet xmlns="${MAIN_NAMESPACE}" xmlns:r="${RELATIONSHIP_NAMESPACE}">${sheetData.text}${newMerges}</worksheet>`;

  return storedZip([
    ["[Content_Types].xml", Buffer.from(XML_DECLARATION + contentTypes, "utf8")],
    ["_rels/.rels", Buffer.from(XML_DECLARATION + packageRelations, "utf8")],
    [WORKBOOK_PART, Buffer.from(XML_DECLARATION + newWorkbook, "utf8")],
    [WORKBOOK_RELATIONS_PART, Buffer.from(XML_DECLARATION + newRelations, "utf8")],
    ["xl/worksheets/sheet1.xml", Buffer.from(XML_DECLARATION + newWorksheet, "utf8")],
    ...parts,
  ]);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * The cell of a sheet value. A formula gives its result, a rich text its runs, a
 * hyperlink its text, an error nothing. `exceljs` gives each cell that shows one
 * shared rich text the same object, so `joined` keeps one text for each object:
 * 5,000 cells of one rich text of 1 MiB hold one text and not 5 GiB (R-064).
 */
function toCell(value: ExcelJS.CellValue, joined: WeakMap<object, string>): SheetCell {
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
    const known = joined.get(value);
    if (known !== undefined) {
      return known;
    }
    const text = value.richText.map((run) => run.text).join("");
    joined.set(value, text);
    return text;
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
  return isObject(result) && !(result instanceof Date) ? "" : toCell(result, joined);
}

/**
 * Reads the first sheet. A row with no cell is dropped, and the other rows keep
 * their numbers. A cell with only spaces stays: the reader of the import cleans it.
 * `maxRows` is the most data rows that the caller takes; the caller still counts
 * the rows that it gets.
 *
 * @returns `unreadable` when the bytes are not a readable workbook with a sheet,
 * or unpack to more than the reader accepts, or the records would hold more
 * than `MAX_TEXT_CHARACTERS`; `too-many-rows` when the first sheet holds far
 * more rows than `maxRows`.
 */
export async function readFirstSheet(bytes: Uint8Array, maxRows: number): Promise<SheetReading> {
  const bounded = boundedWorkbook(bytes, maxRows);
  if (typeof bounded === "string") {
    return { kind: bounded };
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(new Uint8Array(bounded).buffer);
  } catch {
    return { kind: "unreadable" };
  }
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    return { kind: "unreadable" };
  }
  // `columnCount` reads every row, so it is read once and not for each row.
  const columnCount = sheet.columnCount;
  const joined = new WeakMap<object, string>();
  const records: SheetRecord[] = [];
  let characters = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (characters > MAX_TEXT_CHARACTERS) {
      return;
    }
    const width = Math.min(Math.max(columnCount, row.cellCount), MAX_COLUMNS);
    const cells: SheetCell[] = [];
    for (let column = 1; column <= width && characters <= MAX_TEXT_CHARACTERS; column += 1) {
      const cell = toCell(row.getCell(column).value, joined);
      characters += typeof cell === "string" ? cell.length : 0;
      cells.push(cell);
    }
    // A trailing blank cell is formatting, not data: a one-column sheet has one cell.
    while (cells.length > 0 && cells[cells.length - 1] === "") {
      cells.pop();
    }
    if (cells.length > 0) {
      records.push({ number: rowNumber, cells });
    }
  });
  return characters > MAX_TEXT_CHARACTERS ? { kind: "unreadable" } : { kind: "sheet", records };
}
