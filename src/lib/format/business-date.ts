/**
 * The formatter of business dates (DEC-133, DEC-039).
 *
 * A business date is a calendar date, `YYYY-MM-DD`, with no time and no time
 * zone. The interface shows it in the form of a timestamp without the time:
 * `DD.MM.YYYY` in Turkish and `D MMM YYYY` in English (`10 Mar 2026`). The
 * function reads the digits of the text and never builds a `Date`, so no time
 * zone can move the day.
 */
import { ENGLISH_MONTHS } from "./date-time";

const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a business date for the interface.
 *
 * @throws RangeError when `date` is not `YYYY-MM-DD`.
 */
export function formatBusinessDate(date: string, locale: "tr" | "en"): string {
  const parts = BUSINESS_DATE.exec(date);
  const year = parts?.[1];
  const month = parts?.[2];
  const day = parts?.[3];
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError("The business date is not YYYY-MM-DD");
  }
  switch (locale) {
    case "tr":
      return `${day}.${month}.${year}`;
    case "en":
      return `${String(Number(day))} ${ENGLISH_MONTHS[Number(month) - 1] ?? ""} ${year}`;
  }
}
