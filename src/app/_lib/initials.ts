/**
 * The initials that an avatar shows (stage B1 UI table, ACC-30).
 *
 * It takes the first letter of each part, up to two parts, in upper case for the
 * language of the page, so that the Turkish `i` becomes `İ`. The letters are data
 * from a record or from the app name, never copy (`sds-nextjs-frontend` §6). The
 * avatar that shows them is `aria-hidden`, because the control around it holds
 * the full name. This file is pure.
 */
import type { Language } from "@/lib/i18n";

const MAX_INITIALS = 2;

export function initialsOf(parts: readonly string[], language: Language): string {
  return parts
    .map((part) => Array.from(part.trim())[0])
    .filter((letter): letter is string => letter !== undefined)
    .slice(0, MAX_INITIALS)
    .join("")
    .toLocaleUpperCase(language);
}
