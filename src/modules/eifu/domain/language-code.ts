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
