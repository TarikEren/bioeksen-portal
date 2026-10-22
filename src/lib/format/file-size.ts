/**
 * The formatter of file sizes (FND-08 rule 4).
 *
 * The units are decimal (1 KB is 1000 bytes), as the sizes of the health report
 * are. The number has at most one decimal. The decimal separator follows the
 * language: a comma in Turkish, a point in English.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

const numbers = {
  tr: new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1, useGrouping: false }),
  en: new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, useGrouping: false }),
} as const;

/**
 * Formats a size in bytes for the interface: `0 B`, `1,5 KB`, `2.3 MB`.
 *
 * @throws RangeError when `bytes` is negative, not an integer, or not finite.
 */
export function formatFileSize(bytes: number, locale: "tr" | "en"): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError("A file size is a whole number of bytes, 0 or more");
  }
  let value = bytes;
  let unit = 0;
  // Step up while the rounded value would read 1000 of the unit below.
  while (value >= 999.95 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${numbers[locale].format(unit === 0 ? value : Math.round(value * 10) / 10)} ${UNITS[unit] ?? "B"}`;
}
