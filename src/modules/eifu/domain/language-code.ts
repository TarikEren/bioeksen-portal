/**
 * The check of a language code of a document file (DEC-069, IFU-20 rule 4). A
 * language code is a BCP 47 tag (RFC 5646) of up to 35 characters. The
 * interface languages do not limit the codes: `tr`, `de` and `sr-Latn-RS` are
 * valid.
 *
 * The check is the syntax of a well-formed tag (RFC 5646 §2.1): a language
 * subtag with up to three extended language subtags, a script, a region,
 * variants, extensions and a private use part. It does not look a subtag up in
 * the IANA registry. A tag that only has a private use part (`x-…`) is valid.
 *
 * This file is pure.
 */

/** The most characters of a language code (DEC-069, `eifu_document_file.language_code`). */
export const LANGUAGE_CODE_MAX_LENGTH = 35;

const ALPHA = "[a-z]";
const DIGIT = "[0-9]";
const ALNUM = "[a-z0-9]";

const LANGUAGE = `(?:${ALPHA}{2,3}(?:-${ALPHA}{3}){0,3}|${ALPHA}{4}|${ALPHA}{5,8})`;
const SCRIPT = `(?:-${ALPHA}{4})`;
const REGION = `(?:-(?:${ALPHA}{2}|${DIGIT}{3}))`;
const VARIANT = `(?:-(?:${ALNUM}{5,8}|${DIGIT}${ALNUM}{3}))`;
const EXTENSION = `(?:-[0-9a-wyz](?:-${ALNUM}{2,8})+)`;
const PRIVATE_USE = `(?:x(?:-${ALNUM}{1,8})+)`;

const LANGUAGE_TAG = new RegExp(
  `^(?:${LANGUAGE}${SCRIPT}?${REGION}?${VARIANT}*${EXTENSION}*(?:-${PRIVATE_USE})?|${PRIVATE_USE})$`,
  "i",
);

/** Whether the text is a well-formed BCP 47 tag of at most 35 characters. */
export function isLanguageCode(value: string): boolean {
  return value.length <= LANGUAGE_CODE_MAX_LENGTH && LANGUAGE_TAG.test(value);
}

/**
 * The case of RFC 5646 §2.1.1 for a well-formed tag: lower case, except the script
 * (four letters, title case) and the region (two letters, upper case). The casing
 * stops at the first singleton, because an extension and the private use part are
 * lower case.
 */
function formatTag(value: string): string {
  let beforeSingleton = true;
  return value
    .toLowerCase()
    .split("-")
    .map((subtag, index) => {
      if (subtag.length === 1) {
        beforeSingleton = false;
      }
      if (index === 0 || !beforeSingleton) {
        return subtag;
      }
      if (subtag.length === 4 && /^[a-z]{4}$/.test(subtag)) {
        return `${subtag.charAt(0).toUpperCase()}${subtag.slice(1)}`;
      }
      return subtag.length === 2 && /^[a-z]{2}$/.test(subtag) ? subtag.toUpperCase() : subtag;
    })
    .join("-");
}

/**
 * The canonical form of a language code, or `null` when the text is not one
 * (DEC-069, IFU-20 rule 4). The system stores the canonical form of the tag, so
 * that `document_file_one_active_per_language` compares one form: `SR-latn-rs`
 * and `sr-Latn-RS` name one language, and the row keeps `sr-Latn-RS`.
 *
 * `Intl.getCanonicalLocales` gives the form of RFC 5646 §4.5 (and the current
 * alias of a deprecated subtag). It refuses a tag that has only a private use
 * part, and a tag with an extended language subtag. Such a tag is a well-formed
 * tag by `isLanguageCode`, so its canonical form is the case of RFC 5646 §2.1.1.
 *
 * The result is at most 35 characters, as the column holds.
 */
export function canonicalLanguageCode(value: string): string | null {
  if (!isLanguageCode(value)) {
    return null;
  }
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(value)[0] ?? formatTag(value);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    canonical = formatTag(value);
  }
  return canonical.length <= LANGUAGE_CODE_MAX_LENGTH ? canonical : null;
}
