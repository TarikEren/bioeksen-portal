/**
 * The credential check of the endpoints that need an operator (FND-04,
 * `sds-auth`).
 *
 * The check follows the validation order of `sds-auth` and stops at the first
 * failure. One check comes before the order: a demo with no identity provider
 * (DEC-135) cannot verify any token, so every call gets 503 `AUTH-5500`, also
 * a call with no credential. A 401 would tell the caller to send a credential
 * that nothing can accept.
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

import { type IdentityProvider, getIdentityProvider } from "@/lib/config";
import { AppError } from "@/lib/errors";

import { JwksCache } from "./jwks";
import { classifyPrincipal } from "./principal";

export interface OperatorPrincipal {
  readonly kind: "operator";
  /** The subject of the token (`sub`). It correlates; it is not a secret. */
  readonly subject: string;
}

/**
 * The operator that a route authenticated, or a refusal if there is none. The
 * services of the operator endpoints take an `OperatorPrincipal`, so a caller
 * that has no check cannot call them (`sds-nextjs-backend` §1 and §3).
 *
 * @throws AppError `PERM-4151` when `principal` is `null`.
 */
export function requireOperator(principal: OperatorPrincipal | null): OperatorPrincipal {
  if (principal === null || principal.kind !== "operator") {
    throw new AppError("PERM-4151", "Operator role required", { reason: "no operator principal" });
  }
  return principal;
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

function getKeyCache(provider: IdentityProvider): JwksCache {
  cache ??= new JwksCache({ uri: provider.jwksUri, maxAgeSeconds: provider.jwksMaxAgeSeconds });
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
  const provider = getIdentityProvider();
  if (provider === null) {
    throw new AppError("AUTH-5500", "Identity provider unavailable", { reason: "no identity provider is configured" });
  }
  const now = options.now ?? new Date();
  const skewSeconds = provider.clockSkewSeconds;

  const token = readBearerToken(authorizationHeader);

  let unverified: JWTPayload;
  try {
    decodeProtectedHeader(token);
    unverified = decodeJwt(token);
  } catch {
    throw unauthorized("AUTH-4103", "the token does not parse");
  }

  // Expiry first: an expired token yields AUTH-4102 whatever its signature.
  if (unverified.exp !== undefined && unverified.exp < now.getTime() / 1000 - skewSeconds) {
    throw unauthorized("AUTH-4102", "the token is expired");
  }

  // A token for another issuer, app or tenant is refused (step 5) before the keys
  // are needed. If the provider is down, the answer is still AUTH-4101 and not
  // AUTH-5500 (step 6). The check cannot grant anything: the claims are checked
  // again, with the signature, below.
  const audiences = Array.isArray(unverified.aud) ? unverified.aud : [unverified.aud];
  if (
    unverified.iss !== provider.issuer ||
    !audiences.includes(provider.audience) ||
    unverified["tid"] !== provider.tenantId
  ) {
    throw unauthorized("AUTH-4101", "the issuer, audience or tenant is not the configured one");
  }

  const keys = getKeyCache(provider);
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, (header) => keys.resolve(header.kid), {
      algorithms: [ALGORITHM],
      issuer: provider.issuer,
      audience: provider.audience,
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
    payload["tid"] !== provider.tenantId ||
    typeof payload["azp"] !== "string" ||
    payload["azp"] === "" ||
    typeof payload.sub !== "string" ||
    payload.sub === "" ||
    issuedAt === undefined ||
    issuedAt > now.getTime() / 1000 + skewSeconds
  ) {
    throw unauthorized("AUTH-4101", "a claim is rejected");
  }

  switch (classifyPrincipal(payload, provider.operatorScope)) {
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
