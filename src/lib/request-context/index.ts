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

import { AppError } from "@/lib/errors";

export { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";

export interface RequestContext {
  /** `[A-Za-z0-9_-]`, 1 to 128 characters. It is opaque and never trusted as input. */
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

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
