/**
 * The operator credential of a request, with the failure limit of the source
 * (FND-04 rule 4, `sds-auth`, **Rate limiting**).
 *
 * The limit is step 1 of the validation order: a source with 10 failed
 * authentications in a minute gets 429 `RATE-4400` with `Retry-After` for its
 * next request, also when that request carries a valid operator token
 * (FND-04.AC5). The source address is the one of DEC-038. A failed
 * authentication is a request with no credential, an unparseable, expired or
 * rejected token (`AUTH-4100` to `AUTH-4103`). Each request counts as a failure
 * before its token is checked, in one atomic step, so requests at the same time
 * cannot all pass the limit while the count is low. A granted request gives the
 * place back, and a request that fails for another reason counts nothing.
 *
 * The limit protects against a token that an attacker guesses. If Redis is down,
 * the request goes on without the limit and the failure is logged: the full
 * health report must still say that the cache is down, and a token that nobody
 * can sign is not guessed in a minute.
 */
import "server-only";

import { getConfig } from "@/lib/config";
import { AppError, type ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logging";
import {
  type AttemptReservation,
  type WindowLimit,
  cancelAttempt,
  releaseSucceededAttempt,
  reserveAttempt,
} from "@/lib/rate-limit";
import { resolveForwardedSource } from "@/lib/security";

import { type OperatorPrincipal, authenticateOperator } from "./index";

const SCOPE = "operator-auth";
const LIMIT: WindowLimit = { limit: 10, windowMs: 60_000 };
const UNKNOWN_SOURCE = "unknown";

const FAILED_AUTHENTICATION: ReadonlySet<ErrorCode> = new Set(["AUTH-4100", "AUTH-4101", "AUTH-4102", "AUTH-4103"]);

/** Runs a step of the limit. A failure of the cache is logged and does not stop the request: the step gives `null` then. */
async function limitStep<T>(step: () => Promise<T>): Promise<T | null> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof AppError && (error.code === "CACHE-5000" || error.code === "CACHE-5500")) {
      logger.failure(error.code, { tail: { step: "operator failure limit" }, error: error.cause });
      return null;
    }
    throw error;
  }
}

/** Gives back or removes the place of the request. With no reservation (the cache failed), it does nothing. */
async function settle(reservation: AttemptReservation | null, settleStep: (reservation: AttemptReservation) => Promise<void>): Promise<void> {
  if (reservation !== null) {
    await limitStep(() => settleStep(reservation));
  }
}

/**
 * Authenticates the caller as an operator, after the failure limit of its source.
 *
 * @throws RateLimitedError 429 `RATE-4400`, and each error of `authenticateOperator`.
 */
export async function authenticateOperatorRequest(headers: Headers): Promise<OperatorPrincipal> {
  const source = resolveForwardedSource(headers.get("x-forwarded-for"), getConfig().TRUSTED_PROXIES ?? []) ?? UNKNOWN_SOURCE;
  const reservation = await limitStep(() => reserveAttempt({ source: { scope: SCOPE, subject: source, limit: LIMIT } }));
  let principal: OperatorPrincipal;
  try {
    principal = await authenticateOperator(headers.get("authorization"));
  } catch (error) {
    // A failed authentication keeps its place in the window. Any other error counts nothing.
    if (!(error instanceof AppError && FAILED_AUTHENTICATION.has(error.code))) {
      await settle(reservation, cancelAttempt);
    }
    throw error;
  }
  await settle(reservation, releaseSucceededAttempt);
  return principal;
}
