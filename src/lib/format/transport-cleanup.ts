/**
 * Transport cleanup (CAT-30 rule 1, DEC-043): the one cleanup that the catalog
 * and the public lookup share. A number that a person types or a file carries is
 * cleaned with it before any check or any match, so the catalog and the lookup
 * read the same text (IFU-60 rule 2, step 1). The catalog module and the e-IFU
 * module both import it from here, and neither imports the other (DEC-004).
 *
 * This file is pure.
 */

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
