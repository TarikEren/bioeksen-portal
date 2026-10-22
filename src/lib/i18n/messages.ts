/**
 * The formatter of interface messages (FND-08 rule 1, `sds-nextjs-frontend` §6).
 *
 * A dictionary holds a message with named placeholders, such as
 * `"Hata kodu: {code}"`. A component fills them with `fmt` and never joins
 * strings itself, because the order of the words changes between languages.
 * `textForCode` reads the text of a code from a dictionary map and falls back
 * to a sentence the caller names, so that a code with no entry still has text
 * (DEC-122).
 */

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Fills the placeholders of a message. Each value is inserted as it is, in one
 * pass, so a value that holds braces is never read as a placeholder.
 *
 * @throws RangeError when the message names a placeholder that `values` lacks.
 * That is a defect of the dictionary or of the caller, and a test finds it.
 */
export function fmt(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) {
      throw new RangeError(`The message has no value for {${name}}`);
    }
    return String(value);
  });
}

/** Returns the text a dictionary map holds for `code`, else `fallback`. */
export function textForCode(texts: Readonly<Record<string, string>>, code: string, fallback: string): string {
  return Object.hasOwn(texts, code) ? (texts[code] ?? fallback) : fallback;
}
