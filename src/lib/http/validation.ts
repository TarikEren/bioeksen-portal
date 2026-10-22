/**
 * Turns the issues of a zod schema into the one error of `sds-logging`.
 *
 * The code is the first condition of the selection procedure
 * (`code-prefixes.md`) that holds over every fault. The other faults are
 * entries of `details`, one for each field at fault (`error-codes.md`,
 * **Choosing between a code and a detail**):
 *
 * | Step | Fault | Code |
 * |---|---|---|
 * | 14 | a required field is absent | `VAL-4001` |
 * | 15 | a value outside its enumeration | `VAL-4002` |
 * | 19 | a value invalid for its type, format or range | `VAL-4006` |
 * | 20 | a field the endpoint does not define | `VAL-4007` |
 *
 * The text of an entry is a fixed phrase. It never quotes the value that the
 * caller sent.
 *
 * This file is pure.
 */
import type { z } from "zod";

import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";

export type FieldFaultCode = "VAL-4001" | "VAL-4002" | "VAL-4006" | "VAL-4007";

export interface FieldFault {
  readonly code: FieldFaultCode;
  readonly entry: FieldIssue;
}

/** The most entries of `details`. A body with more faults is cut. */
const MAX_DETAILS = 100;

/** The order of the selection procedure. The lowest index wins. */
const PRECEDENCE: readonly FieldFaultCode[] = ["VAL-4001", "VAL-4002", "VAL-4006", "VAL-4007"];

/** The name of a field: its path with dots, or `body` for the whole body. */
function fieldName(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "body" : path.map(String).join(".");
}

/** Whether the value at `path` is missing from `input`: its parent is an object without that key. */
function isMissing(input: unknown, path: readonly PropertyKey[]): boolean {
  let current: unknown = input;
  for (const [index, key] of path.entries()) {
    if (typeof current !== "object" || current === null) {
      return false;
    }
    const isLast = index === path.length - 1;
    if (isLast) {
      return !Object.hasOwn(current, key);
    }
    current = Reflect.get(current, key);
  }
  return false;
}

function typePhrase(expected: string): string {
  return `must be of the type ${expected}`;
}

/** The faults of one issue. A zod `unrecognized_keys` issue holds one fault for each key. */
function faultsOfIssue(input: unknown, issue: z.core.$ZodIssue): FieldFault[] {
  const field = fieldName(issue.path);
  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        code: "VAL-4007",
        entry: { field: fieldName([...issue.path, key]), issue: "is not a field of this endpoint" },
      }));
    case "invalid_type":
      return isMissing(input, issue.path)
        ? [{ code: "VAL-4001", entry: { field, issue: "is required" } }]
        : [{ code: "VAL-4006", entry: { field, issue: typePhrase(issue.expected) } }];
    case "invalid_value":
      return [{ code: "VAL-4002", entry: { field, issue: "is not one of the allowed values" } }];
    case "too_small":
    case "too_big":
      return [{ code: "VAL-4006", entry: { field, issue: "is out of range" } }];
    case "invalid_format":
      return [{ code: "VAL-4006", entry: { field, issue: "has the wrong format" } }];
    default:
      return [{ code: "VAL-4006", entry: { field, issue: "is not valid" } }];
  }
}

/**
 * The faults of a failed parse, in the order of the issues.
 *
 * @param input The value that was parsed. It tells a missing field from a field of the wrong type.
 */
export function faultsOf(input: unknown, issues: readonly z.core.$ZodIssue[]): FieldFault[] {
  return issues.flatMap((issue) => faultsOfIssue(input, issue));
}

/** The error for a list of faults. The code is the first of the selection procedure. */
export function validationError(faults: readonly FieldFault[]): AppError {
  const code = PRECEDENCE.find((candidate) => faults.some((fault) => fault.code === candidate)) ?? "VAL-4006";
  return new AppError(code, CODE_MEANINGS[code], {
    details: faults.slice(0, MAX_DETAILS).map((fault) => fault.entry),
  });
}

/** The error for a failed parse of a request body. */
export function bodyValidationError(input: unknown, error: z.ZodError): AppError {
  return validationError(faultsOf(input, error.issues));
}
