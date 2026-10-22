/**
 * The envelopes of `sds-api-design`: the answer of a route handler and the
 * result of a server action (FND-05 rule 2).
 *
 * `{ status: "ok", … }` is a success. `{ status: "fail", code, message,
 * details }` is a failure. The `code` is the code of the log record of the
 * same failure (FND-05 rule 3).
 */
import type { AppError, ErrorDetails } from "./app-error";
import type { ErrorCode } from "./codes";

export interface FailureEnvelope {
  readonly status: "fail";
  readonly code: ErrorCode;
  readonly message: string;
  readonly details: ErrorDetails;
}

export type SuccessEnvelope<TBody extends object = Record<never, never>> = { readonly status: "ok" } & TBody;

/** What a server action returns. */
export type ActionResult<TBody extends object = Record<never, never>> = SuccessEnvelope<TBody> | FailureEnvelope;

/** Builds the failure envelope of an error. */
export function failureEnvelope(error: AppError): FailureEnvelope {
  return { status: "fail", code: error.code, message: error.message, details: error.details };
}
