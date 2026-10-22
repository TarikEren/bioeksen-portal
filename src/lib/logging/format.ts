/**
 * The text of a log record: the logfmt tail, the redaction and the limits of
 * `log-record.md` (**Message**, **Structured tail**) and of `sds-logging`
 * (**What MUST NOT be logged**, FND-05 rule 5).
 *
 * This file is pure. It reads nothing from the process.
 */

/** The message of a record holds at most this many characters. */
export const MAX_MESSAGE_LENGTH = 8192;

/** A value of the tail holds at most this many characters. */
const MAX_VALUE_LENGTH = 1024;

const REDACTED = "[redacted]";

/** A key whose value is a secret by its name. The value is never written. */
const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|authorization|cookie|session|credential|api_?key|access_?key|signature|pepper|otp|verification/i;

const PATTERNS: readonly (readonly [RegExp, string])[] = [
  // A bearer credential.
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  // A JSON Web Token, wherever it appears.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED],
  // The user and the password of a connection string or a URL.
  [/\b([a-z][a-z0-9+.-]*:\/\/)\S*@/gi, `$1${REDACTED}@`],
  // `name=value` and `name: value` of a secret, such as `password=...` or `X-Amz-Signature=...`.
  [
    /\b(pass(?:word|wd)?|secret|token|authorization|cookie|session[_-]?id|credential|api[_-]?key|access[_-]?key|signature|pepper)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi,
    `$1$2${REDACTED}`,
  ],
  // An email address (FND-05 rule 5).
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[redacted-email]"],
];

/** Removes what the forbidden list of `sds-logging` names from free text. */
export function redactText(text: string): string {
  return PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

/** One line: every control character, the newline included, becomes a space. */
function toOneLine(text: string): string {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || code === 0x2028 || code === 0x2029 ? " " : character;
  })
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}

/** The key as the rule asks: lowercase `[a-z0-9_]`. */
function normalizeKey(key: string): string {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return normalized === "" ? "_" : normalized;
}

function quote(value: string): string {
  if (value !== "" && !/[\s="\\]/.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The value as it is written in the tail: redacted, on one line, bounded and quoted. */
export function formatTailValue(key: string, value: string | number | boolean): string {
  if (SENSITIVE_KEY.test(key)) {
    return REDACTED;
  }
  return quote(truncate(toOneLine(redactText(String(value))), MAX_VALUE_LENGTH));
}

/** The `key=value` pairs, space separated. A key that repeats keeps its first value. */
export function formatTail(tail: Readonly<Record<string, string | number | boolean>>): string {
  const seen = new Set<string>();
  const pairs: string[] = [];
  for (const [rawKey, value] of Object.entries(tail)) {
    const key = normalizeKey(rawKey);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    pairs.push(`${key}=${formatTailValue(key, value)}`);
  }
  return pairs.join(" ");
}

/** The prose followed by the tail, on one line, at most `MAX_MESSAGE_LENGTH` characters. */
export function buildMessage(prose: string, tail: Readonly<Record<string, string | number | boolean>>): string {
  const tailText = formatTail(tail);
  const message = tailText === "" ? toOneLine(prose) : `${toOneLine(prose)} ${tailText}`;
  return truncate(message, MAX_MESSAGE_LENGTH);
}

/** The text of an error for the tail keys `error` and `cause` (`log-record.md`, **Reserved keys**). */
export function describeError(error: unknown): { readonly error: string; readonly cause?: string } {
  const chain: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof Error) {
      chain.push(`${current.name}: ${current.message}`);
      current = current.cause;
    } else {
      chain.push(String(current));
      current = undefined;
    }
  }
  const [first, ...rest] = chain;
  const text = first ?? "unknown";
  return rest.length === 0 ? { error: text } : { error: text, cause: rest.join(" <- ") };
}
