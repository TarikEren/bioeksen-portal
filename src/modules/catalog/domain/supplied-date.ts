/**
 * The supplied manufacturing date of a LOT or an import row (DEC-053).
 *
 * It is `YYYY-MM-DD`, `DD.MM.YYYY` or `DD/MM/YYYY`, or the date cell of an XLSX
 * file. The day always comes before the month. This file is pure.
 */
import { toCalendarDate } from "./calendar";

export type SuppliedDateResult =
  | { readonly status: "ok"; readonly date: string }
  /** The cell holds no value. The row has no supplied date. */
  | { readonly status: "empty" }
  /** The cell holds a value that is not a date, or not a calendar date (`SUPPLIED_DATE_INVALID`). */
  | { readonly status: "invalid" };

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_PATTERN = /^(\d{2})[./](\d{2})[./](\d{4})$/;

/**
 * Reads one cell. A `Date` is the date cell of an XLSX file: its calendar date
 * in UTC is the date, because the reader gives the date at midnight UTC.
 */
export function readSuppliedDate(cell: string | Date | null): SuppliedDateResult {
  if (cell === null) {
    return { status: "empty" };
  }
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) {
      return { status: "invalid" };
    }
    const date = toCalendarDate(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
    return date === null ? { status: "invalid" } : { status: "ok", date };
  }
  const text = cell.trim();
  if (text === "") {
    return { status: "empty" };
  }
  const iso = ISO_PATTERN.exec(text);
  const dayFirst = iso === null ? DAY_FIRST_PATTERN.exec(text) : null;
  let date: string | null = null;
  if (iso !== null) {
    date = toCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  } else if (dayFirst !== null) {
    date = toCalendarDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  }
  return date === null ? { status: "invalid" } : { status: "ok", date };
}
