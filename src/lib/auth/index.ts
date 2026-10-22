/**
 * The credential check of the endpoints that need an operator (FND-04,
 * `sds-auth`).
 *
 * The check follows the validation order of `sds-auth` and stops at the first
 * failure:
 *
 * 1. no `Authorization` header, or not the `Bearer` scheme: 401 `AUTH-4100`;
 * 2. the token does not parse: 401 `AUTH-4103`;
 * 3. `exp` is in the past: 401 `AUTH-4102`. This comes before the signature, so
 *    an expired token with a bad signature is `AUTH-4102`;
 * 4. the signature or a claim is rejected: 401 `AUTH-4101`;
 * 5. the keys cannot be fetched: 503 `AUTH-5500`;
 * 6. the token is valid and its principal is not an operator: 403 `PERM-4151`.
 *
 * The rate limit of failed authentication (step 1 of the order, FND-04.AC5) is
 * due in stage B1.
 *
 * An app credential never satisfies an operator requirement. A rejection never
 * says which claim failed or whether the principal exists: the answer holds the
 * code and a fixed message, and the log record holds the reason.
 */
import "server-only";

import { type JWTPayload, decodeJwt, decodeProtectedHeader, errors, jwtVerify } from "jose";

import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

import { JwksCache } from "./jwks";
import { classifyPrincipal } from "./principal";

export interface OperatorPrincipal {
  readonly kind: "operator";
  /** The subject of the token (`sub`). It correlates; it is not a secret. */
  readonly subject: string;
}

export interface AuthenticateOptions {
  /** The clock. Tests fix it. Default: now. */
  readonly now?: Date;
}

/** The only algorithm that the app accepts. The header of a token never chooses it. */
const ALGORITHM = "RS256";

const BEARER = /^Bearer[ \t]+(.*)$/i;

const UNAUTHORIZED_MESSAGES = {
  "AUTH-4100": "Credential missing",
  "AUTH-4101": "Credential invalid",
  "AUTH-4102": "Credential expired",
  "AUTH-4103": "Credential malformed",
} as const;

let cache: JwksCache | undefined;

function getKeyCache(): JwksCache {
  if (cache === undefined) {
    const config = getConfig();
    cache = new JwksCache({ uri: config.ENTRA_JWKS_URI, maxAgeSeconds: config.ENTRA_JWKS_MAX_AGE_SECONDS });
  }
  return cache;
}

function unauthorized(code: keyof typeof UNAUTHORIZED_MESSAGES, reason: string): AppError {
  return new AppError(code, UNAUTHORIZED_MESSAGES[code], { reason });
}

/** The compact token of the header, or the failure of the first step. */
function readBearerToken(authorizationHeader: string | null): string {
  if (authorizationHeader === null) {
    throw unauthorized("AUTH-4100", "no Authorization header");
  }
  const match = BEARER.exec(authorizationHeader.trim());
  if (match === null) {
    throw unauthorized("AUTH-4100", "the scheme is not Bearer");
  }
  const token = (match[1] ?? "").trim();
  if (token === "") {
    throw unauthorized("AUTH-4100", "the Bearer credential is empty");
  }
  return token;
}

/**
 * Authenticates the caller as an operator.
 *
 * @param authorizationHeader The value of the `Authorization` header, `null` when absent.
 * @throws AppError `AUTH-4100`, `AUTH-4101`, `AUTH-4102`, `AUTH-4103`, `AUTH-5500`, `PERM-4151`.
 */
export async function authenticateOperator(
  authorizationHeader: string | null,
  options: AuthenticateOptions = {},
): Promise<OperatorPrincipal> {
  const config = getConfig();
  const now = options.now ?? new Date();
  const skewSeconds = config.AUTH_CLOCK_SKEW_SECONDS;

  const token = readBearerToken(authorizationHeader);

  let unverifiedExpiry: number | undefined;
  try {
    decodeProtectedHeader(token);
    unverifiedExpiry = decodeJwt(token).exp;
  } catch {
    throw unauthorized("AUTH-4103", "the token does not parse");
  }

  // Expiry first: an expired token yields AUTH-4102 whatever its signature.
  if (unverifiedExpiry !== undefined && unverifiedExpiry < now.getTime() / 1000 - skewSeconds) {
    throw unauthorized("AUTH-4102", "the token is expired");
  }

  const keys = getKeyCache();
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, (header) => keys.resolve(header.kid), {
      algorithms: [ALGORITHM],
      issuer: config.ENTRA_ISSUER,
      audience: config.ENTRA_AUDIENCE,
      clockTolerance: skewSeconds,
      currentDate: now,
      requiredClaims: ["exp", "iat", "sub", "azp", "tid"],
    });
    payload = verified.payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof errors.JWTExpired) {
      throw unauthorized("AUTH-4102", "the token is expired");
    }
    if (error instanceof errors.JOSEError) {
      throw unauthorized("AUTH-4101", `the token is rejected (${error.code})`);
    }
    throw error;
  }

  const issuedAt = payload.iat;
  if (
    payload["tid"] !== config.ENTRA_TENANT_ID ||
    typeof payload["azp"] !== "string" ||
    payload["azp"] === "" ||
    typeof payload.sub !== "string" ||
    payload.sub === "" ||
    issuedAt === undefined ||
    issuedAt > now.getTime() / 1000 + skewSeconds
  ) {
    throw unauthorized("AUTH-4101", "a claim is rejected");
  }

  switch (classifyPrincipal(payload, config.ENTRA_OPERATOR_SCOPE)) {
    case "operator":
      return { kind: "operator", subject: payload.sub };
    case "none":
      throw unauthorized("AUTH-4101", "the token names no principal type");
    case "app":
      throw new AppError("PERM-4151", "Operator role required", { reason: "an app credential" });
    case "person":
      throw new AppError("PERM-4151", "Operator role required", {
        reason: "a person without the operator scope and role",
      });
  }
}
