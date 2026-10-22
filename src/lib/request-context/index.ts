/**
 * The context of one request: the request id that every log record and every
 * answer of the request carry (FND-05 rules 3 and 4, `sds-logging`
 * `log-record.md` **Correlation**).
 *
 * The store is a module-level `AsyncLocalStorage`, never a property of
 * `globalThis` (`sds-nextjs-backend` §1).
 */
import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/errors";

export const REQUEST_ID_HEADER = "X-Request-Id";

export interface RequestContext {
  /** `[A-Za-z0-9_-]`, 1 to 128 characters. It is opaque and never trusted as input. */
  readonly requestId: string;
}

/** The form of a request id that the app adopts (`log-record.md`, **`X-Request-Id`**). */
const REQUEST_ID_FORMAT = /^[A-Za-z0-9_-]{1,128}$/;

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Adopts the request id of the caller, or makes a new one.
 *
 * A value that is absent or malformed gives a new id. It never fails the
 * request (`log-record.md`, **`X-Request-Id`**). A new id is a UUID v4, which
 * has 122 bits of entropy.
 */
export function resolveRequestId(headerValue: string | null): string {
  if (headerValue !== null && REQUEST_ID_FORMAT.test(headerValue)) {
    return headerValue;
  }
  return randomUUID();
}

/** Runs `fn` with `context` as the context of the current request. */
export function runWithRequestContext<TResult>(context: RequestContext, fn: () => TResult): TResult {
  return storage.run(context, fn);
}

/** The context of the current request, `undefined` outside a request (a log record at start, for example). */
export function findRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * The context of the current request.
 *
 * @throws AppError `SYS-5000` when the code runs outside a request. That is a
 * defect of the caller.
 */
export function getRequestContext(): RequestContext {
  const context = storage.getStore();
  if (context === undefined) {
    throw new AppError("SYS-5000", "No request context");
  }
  return context;
}
