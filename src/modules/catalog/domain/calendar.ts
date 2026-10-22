/**
 * Calendar dates for the LOT rules (DEC-039, DEC-044, DEC-053).
 *
 * A business date is a calendar date with no time zone. It is the text
 * `YYYY-MM-DD`, so two dates compare as texts. This file is pure.
 */

/** The days of a month of a year, with the leap year of the Gregorian calendar. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * The date `YYYY-MM-DD` of a year, a month and a day, or `null` when the three
 * numbers are not a calendar date (for example 29 February 2025).
 */
export function toCalendarDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}
