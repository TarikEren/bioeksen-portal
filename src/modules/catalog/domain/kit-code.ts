/**
 * The kit code check (CAT-50, DEC-048, DEC-049).
 *
 * The check runs at a registration and at an import, never in a lookup. The kit
 * code is never a key to find a LOT or a product. This file is pure.
 */
import type { Format } from "@/lib/schemas/catalog";

import { readEncodedDate } from "./lot-number";

/** The letter that a format adds to the kit code base (DEC-048). `LIQUID` adds none. */
const FORMAT_LETTER: Readonly<Record<Format, string>> = { VCAP: "V", LYOPHILIZED: "L", LIQUID: "" };

/**
 * The expected kit code of a product and a format: the base, then the letter of
 * the format (DEC-048). It is `null` when the check does not apply: the product
 * has no kit code base, or the catalog number has no format (DEC-049).
 */
export function expectedKitCode(base: string | null, format: Format | null): string | null {
  if (base === null || format === null) {
    return null;
  }
  return `${base}${FORMAT_LETTER[format]}`;
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

/**
 * Whether a cleaned LOT number passes the kit code check (DEC-048): the part
 * after its date ends with the expected kit code, followed by zero or more
 * digits. A check that does not apply passes (DEC-049, CAT-50.AC4, AC5). A LOT
 * number that encodes no date does not pass, because the part after the date is
 * unknown.
 */
export function kitCodeMatches(lotNumber: string, base: string | null, format: Format | null): boolean {
  const expected = expectedKitCode(base, format);
  if (expected === null) {
    return true;
  }
  const encoded = readEncodedDate(lotNumber);
  if (encoded.status !== "ok") {
    return false;
  }
  let end = encoded.suffix.length;
  for (;;) {
    if (encoded.suffix.slice(0, end).endsWith(expected)) {
      return true;
    }
    if (end > 0 && isDigit(encoded.suffix[end - 1])) {
      end -= 1;
    } else {
      return false;
    }
  }
}
