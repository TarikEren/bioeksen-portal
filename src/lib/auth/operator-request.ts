/**
 * The operator credential of a request, with the failure limit of the source
 * (FND-04 rule 4, `sds-auth`, **Rate limiting**).
 *
 * The limit is step 1 of the validation order: a source with 10 failed
 * authentications in a minute gets 429 `RATE-4400` with `Retry-After` for its
 * next request, also when that request carries a valid operator token
 * (FND-04.AC5). The source address is the one of DEC-038. A failed
 * authentication is a request with no credential, an unparseable, expired or
 * rejected token (`AUTH-4100` to `AUTH-4103`).
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
import { type WindowLimit, assertBelowLimit, recordFailure } from "@/lib/rate-limit";
import { resolveForwardedSource } from "@/lib/security";

import { type OperatorPrincipal, authenticateOperator } from "./index";

const SCOPE = "operator-auth";
const LIMIT: WindowLimit = { limit: 10, windowMs: 60_000 };
const UNKNOWN_SOURCE = "unknown";

const FAILED_AUTHENTICATION: ReadonlySet<ErrorCode> = new Set(["AUTH-4100", "AUTH-4101", "AUTH-4102", "AUTH-4103"]);

/** Runs a step of the limit. A failure of the cache is logged and does not stop the request. */
async function limitStep(step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    if (error instanceof AppError && (error.code === "CACHE-5000" || error.code === "CACHE-5500")) {
      logger.failure(error.code, { tail: { step: "operator failure limit" }, error: error.cause });
      return;
    }
    throw error;
  }
}

/**
 * Authenticates the caller as an operator, after the failure limit of its source.
 *
 * @throws RateLimitedError 429 `RATE-4400`, and each error of `authenticateOperator`.
 */
export async function authenticateOperatorRequest(headers: Headers): Promise<OperatorPrincipal> {
  const source = resolveForwardedSource(headers.get("x-forwarded-for"), getConfig().TRUSTED_PROXIES ?? []) ?? UNKNOWN_SOURCE;
  await limitStep(() => assertBelowLimit(SCOPE, source, LIMIT));
  try {
    return await authenticateOperator(headers.get("authorization"));
  } catch (error) {
    if (error instanceof AppError && FAILED_AUTHENTICATION.has(error.code)) {
      await limitStep(() => recordFailure(SCOPE, source, LIMIT));
    }
    throw error;
  }
}
