/**
 * What the code decides about a failure record (`code-prefixes.md`, **Derived
 * attributes**): the severity, the type and the prose. A caller never picks
 * these for a failure.
 *
 * Two rows of the severity table depend on time and are not derived here:
 * `SYS-5500` after the startup budget, and `DB-5501` sustained for more than
 * 60 seconds. They stay `ERROR` until the app measures the duration.
 */
import { CODE_MEANINGS, type ErrorCode } from "@/lib/errors";

import type { LogType, Severity } from "./severities";

const FATAL_CODES: readonly ErrorCode[] = ["DB-5500", "CFG-5000", "CFG-5001"];

/** `WARNING` for a 4xxx code, `ERROR` for a 5xxx code, `FATAL` for the three codes of the table. */
export function severityOfCode(code: ErrorCode): Severity {
  if (FATAL_CODES.includes(code)) {
    return "FATAL";
  }
  return code.includes("-4") ? "WARNING" : "ERROR";
}

/** `SECURITY` for `AUTH-` and `PERM-`, `JOB` for `JOB-`, else `APP`. */
export function logTypeOfCode(code: ErrorCode): LogType {
  if (code.startsWith("AUTH-") || code.startsWith("PERM-")) {
    return "SECURITY";
  }
  return code.startsWith("JOB-") ? "JOB" : "APP";
}

/** The Meaning text of the code with only its first character lowercased. */
export function proseOfCode(code: ErrorCode): string {
  const meaning = CODE_MEANINGS[code];
  return `${meaning.charAt(0).toLowerCase()}${meaning.slice(1)}`;
}
