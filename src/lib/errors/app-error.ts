/**
 * The typed error of the app (FND-05 rule 2).
 *
 * Every failure that leaves a layer is an `AppError` with a code of the
 * registry (DEC-013). A route handler and a server action map it to the same
 * envelope (`./envelope.ts`).
 */
import { type ErrorCode, httpStatusOf } from "./codes";

/** A JSON value. `details` holds only values that JSON can carry. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** One entry of `details` for a code about fields (`VAL-4001` to `VAL-4007`). */
export interface FieldIssue {
  readonly field: string;
  readonly issue: string;
}

/**
 * The `details` of a failure. A code about fields carries one entry for each
 * field at fault. Any other code carries the object of its registry entry, or
 * `null` when the entry defines none.
 */
export type ErrorDetails = readonly FieldIssue[] | { readonly [key: string]: JsonValue } | null;

export interface AppErrorOptions {
  readonly details?: ErrorDetails;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.details = options.details ?? null;
  }

  /** The HTTP status of the code. */
  get status(): number {
    return httpStatusOf(this.code);
  }
}

/**
 * An operation that the contract names and no code implements yet.
 *
 * The code is `SYS-5000` and the status is 500, never 501 (`sds-logging`,
 * `code-prefixes.md`, **Not implemented**). The skeleton of a stage throws it,
 * so that the acceptance tests fail for the missing behavior.
 */
export class NotImplemented extends AppError {
  /** The operation, for the log record. The answer does not carry it. */
  readonly operation: string;

  constructor(operation: string) {
    super("SYS-5000", "Not implemented");
    this.name = "NotImplemented";
    this.operation = operation;
  }
}
