/**
 * The two rules that make a stored LOT number and a manufacturing date from a
 * received LOT number (CAT-30, DEC-043, DEC-044).
 *
 * Each rule is one function. No other code takes a substring of a LOT number
 * (CAT-30 rule 3), except `readEncodedDate`, which also gives the part after the
 * date for the kit code (`kit-code.ts`). This file is pure.
 */
import { toCalendarDate } from "./calendar";

// The transport cleanup is shared with the public lookup, so it lives in `src/lib/format` (DEC-004).
export { cleanTransport } from "@/lib/format/transport-cleanup";

/** The result of the date reading (CAT-30 rule 2). The two failures are two different issues (CAT-30.AC2, AC3). */
export type EncodedDateResult =
  | {
      readonly status: "ok";
      /** The manufacturing date `YYYY-MM-DD`, century base 2000 (DEC-044). */
      readonly date: string;
      /** The part of the LOT number after the date. It is never empty. */
      readonly suffix: string;
    }
  | { readonly status: "format_invalid" }
  | { readonly status: "date_invalid" };

/** The pattern of DEC-044. */
const ENCODED_DATE_PATTERN = /^B(\d{2})(\d{2})(\d{2})(.+)$/;
const CENTURY_BASE = 2000;

/**
 * Reads the manufacturing date that a cleaned LOT number encodes (DEC-044). The
 * function never corrects the LOT number or the date.
 */
export function readEncodedDate(lotNumber: string): EncodedDateResult {
  const match = ENCODED_DATE_PATTERN.exec(lotNumber);
  if (match === null) {
    return { status: "format_invalid" };
  }
  const [, yy = "", mm = "", dd = "", suffix = ""] = match;
  const date = toCalendarDate(CENTURY_BASE + Number(yy), Number(mm), Number(dd));
  return date === null ? { status: "date_invalid" } : { status: "ok", date, suffix };
}
