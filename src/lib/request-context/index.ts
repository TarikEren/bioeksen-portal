/**
 * The context of one request: the request id that every log record and every
 * answer of the request carry (FND-05 rules 3 and 4, `sds-logging`
 * `log-record.md` **Correlation**).
 *
 * Skeleton of stage B0: the names and the signatures. Every body throws
 * `NotImplemented`. The store is a module-level `AsyncLocalStorage`, never a
 * property of `globalThis` (`sds-nextjs-backend` §1).
 */
import "server-only";

import { NotImplemented } from "@/lib/errors";

export const REQUEST_ID_HEADER = "X-Request-Id";

export interface RequestContext {
  /** `[A-Za-z0-9_-]`, 1 to 128 characters. It is opaque and never trusted as input. */
  readonly requestId: string;
}

/**
 * Adopts the request id of the caller, or makes a new one.
 *
 * A value that is absent or malformed gives a new id. It never fails the
 * request (`log-record.md`, **`X-Request-Id`**).
 */
export function resolveRequestId(headerValue: string | null): string {
  void headerValue;
  throw new NotImplemented("resolveRequestId");
}

/** Runs `fn` with `context` as the context of the current request. */
export function runWithRequestContext<TResult>(context: RequestContext, fn: () => TResult): TResult {
  void context;
  void fn;
  throw new NotImplemented("runWithRequestContext");
}

/** The context of the current request. */
export function getRequestContext(): RequestContext {
  throw new NotImplemented("getRequestContext");
}
