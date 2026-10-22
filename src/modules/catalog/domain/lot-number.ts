/**
 * The two rules that make a stored LOT number and a manufacturing date from a
 * received LOT number (CAT-30, DEC-043, DEC-044).
 *
 * Each rule is one function. No other code takes a substring of a LOT number
 * (CAT-30 rule 3), except `readEncodedDate`, which also gives the part after the
 * date for the kit code (`kit-code.ts`). This file is pure.
 */
import { toCalendarDate } from "./calendar";

/** The whitespace characters of transport cleanup (CAT-30 rule 1). It is not `String.trim()`. */
const WHITESPACE: ReadonlySet<string> = new Set([" ", "\t", "\r", "\n", " ", " ", " "]);
const QUOTES: ReadonlySet<string> = new Set(['"', "'"]);
const BOM = "﻿";

/** Removes the characters of `set` at both ends of `value`. */
function stripEnds(value: string, set: ReadonlySet<string>): string {
  let start = 0;
  let end = value.length;
  while (start < end && set.has(value.charAt(start))) {
    start += 1;
  }
  while (end > start && set.has(value.charAt(end - 1))) {
    end -= 1;
  }
  return value.slice(start, end);
}

/**
 * Transport cleanup (CAT-30 rule 1): a BOM at the start, then the whitespace at
 * both ends, then the quotes at both ends, then the whitespace at both ends
 * again. It changes nothing inside the value (DEC-043): not the letter case, not
 * a separator, not an inner space.
 */
export function cleanTransport(value: string): string {
  const withoutBom = value.startsWith(BOM) ? value.slice(BOM.length) : value;
  return stripEnds(stripEnds(stripEnds(withoutBom, WHITESPACE), QUOTES), WHITESPACE);
}

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
