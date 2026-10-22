/**
 * The wrapper of a server action (FND-05 rule 2, `sds-api-design`).
 *
 * A server action returns the same envelope as a route handler. The wrapper
 * opens the request context with the request id that the proxy set on the
 * request, so every log record of the action carries `request=`. It turns an
 * error into the failure envelope and writes one record with the same code. The
 * body of the action decides who may call it: a server action is a public POST
 * endpoint (`sds-nextjs-backend` §3).
 */
import "server-only";

import { headers } from "next/headers";

import { type ActionResult, AppError, failureEnvelope } from "@/lib/errors";
import { logger } from "@/lib/logging";
import { REQUEST_ID_HEADER, resolveRequestId, runWithRequestContext } from "@/lib/request-context";

/**
 * Runs the body of a server action.
 *
 * @param name The name of the action, for the log record.
 * @param body Throws an `AppError` for a refusal, and returns the success envelope.
 */
export async function runAction<TBody extends object = Record<never, never>>(
  name: string,
  body: () => Promise<ActionResult<TBody>>,
): Promise<ActionResult<TBody>> {
  const requestId = resolveRequestId((await headers()).get(REQUEST_ID_HEADER));
  return runWithRequestContext({ requestId }, async () => {
    try {
      return await body();
    } catch (error) {
      const unhandled = !(error instanceof AppError);
      const appError = unhandled ? new AppError("SYS-5000", "Unhandled error", { cause: error }) : error;
      logger.failure(appError.code, {
        tail: { action: name, ...(appError.reason === null ? {} : { reason: appError.reason }) },
        error: unhandled ? error : appError.cause,
      });
      return failureEnvelope(appError);
    }
  });
}
