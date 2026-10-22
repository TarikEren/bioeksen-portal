/**
 * Mints the bearer tokens of the auth cases (`sds-auth`, `credentials.md`;
 * `sds-testing`, `contract-tests.md`, **Auth**).
 *
 * Each token is an RS256 JWT with the claims of `credentials.md`, **Required
 * claims**. A trusted token is signed with the key of the local issuer
 * (`tests/support/token-issuer.ts`); a forged one with a key the app does
 * not trust, under the same `kid`, so the app finds the key and the signature
 * check fails.
 */
import { randomUUID } from "node:crypto";

import { type JWK, type JWTPayload, SignJWT, generateKeyPair, importJWK } from "jose";

import type { TestIssuer } from "./token-issuer";
import {
  TEST_AUDIENCE,
  TEST_CLOCK_SKEW_SECONDS,
  TEST_ISSUER,
  TEST_OPERATOR_SCOPE,
  TEST_OPERATOR_TOOL_CLIENT_ID,
  TEST_OTHER_APP_CLIENT_ID,
  TEST_TENANT_ID,
} from "./test-environment";

/** The kinds of token a test can ask for. */
export type TokenKind =
  /** A person with the operator scope and the `operator` role: an operator. */
  | "operator"
  /** A person with the operator scope and no `operator` role. */
  | "person-without-role"
  /** A person with the `operator` role and another scope. */
  | "role-without-scope"
  /** An app-only token: `roles`, no `scp`. */
  | "app"
  /** An operator token whose `exp` passed beyond the skew allowance. */
  | "expired"
  /** An expired operator token that also carries a bad signature. */
  | "expired-and-forged"
  /** An unexpired operator token signed by a key the app does not trust. */
  | "wrong-signature"
  /** An operator token whose `aud` names another app. */
  | "wrong-audience"
  /** An operator token from another issuer. */
  | "wrong-issuer"
  /** An operator token of another tenant. */
  | "wrong-tenant"
  /** An operator token with a `kid` that the JWKS does not hold. */
  | "unknown-kid";

interface Claims {
  readonly iss: string;
  readonly aud: string;
  readonly tid: string;
  readonly azp: string;
  readonly sub: string;
  readonly scp?: string;
  readonly roles?: readonly string[];
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
}

let untrustedKey: Promise<CryptoKey> | undefined;

/** A key pair that no JWKS publishes. */
async function untrustedPrivateKey(): Promise<CryptoKey> {
  untrustedKey ??= generateKeyPair("RS256").then((pair) => pair.privateKey);
  return await untrustedKey;
}

async function trustedPrivateKey(issuer: TestIssuer): Promise<CryptoKey> {
  const parsed: unknown = JSON.parse(issuer.privateJwk);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The test issuer gave no private key.");
  }
  const jwk: JWK = { ...parsed };
  const key = await importJWK(jwk, "RS256");
  if (key instanceof Uint8Array) {
    throw new Error("The test issuer gave a symmetric key.");
  }
  return key;
}

function operatorClaims(nowSeconds: number): Claims {
  return {
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    tid: TEST_TENANT_ID,
    azp: TEST_OPERATOR_TOOL_CLIENT_ID,
    sub: "qa-operator-7f3e",
    scp: TEST_OPERATOR_SCOPE,
    roles: ["operator"],
    iat: nowSeconds - 60,
    nbf: nowSeconds - 60,
    exp: nowSeconds + 3600,
  };
}

function claimsFor(kind: TokenKind, nowSeconds: number): Claims {
  const operator = operatorClaims(nowSeconds);
  const expiredTimes = {
    iat: nowSeconds - 4000,
    nbf: nowSeconds - 4000,
    exp: nowSeconds - (TEST_CLOCK_SKEW_SECONDS + 600),
  };
  switch (kind) {
    case "operator":
    case "wrong-signature":
    case "unknown-kid":
      return operator;
    case "person-without-role":
      return { ...operator, sub: "qa-person-1a2b", roles: [] };
    case "role-without-scope":
      return { ...operator, scp: "User.Read" };
    case "app":
      return {
        iss: operator.iss,
        aud: operator.aud,
        tid: operator.tid,
        azp: TEST_OTHER_APP_CLIENT_ID,
        sub: TEST_OTHER_APP_CLIENT_ID,
        roles: ["logs.write"],
        iat: operator.iat,
        nbf: operator.nbf,
        exp: operator.exp,
      };
    case "expired":
    case "expired-and-forged":
      return { ...operator, ...expiredTimes };
    case "wrong-audience":
      return { ...operator, aud: "api://another-app" };
    case "wrong-issuer":
      return { ...operator, iss: "https://login.microsoftonline.com/00000000-0000-4000-8000-000000000000/v2.0" };
    case "wrong-tenant":
      return { ...operator, tid: "00000000-0000-4000-8000-000000000000" };
  }
}

/**
 * Mints a token of the kind.
 *
 * @param issuer The local issuer, from `inject("testIssuer")` or the e2e fixture.
 * @param now The time the token is made, in milliseconds. Default: now.
 */
export async function mintToken(issuer: TestIssuer, kind: TokenKind, now: number = Date.now()): Promise<string> {
  const nowSeconds = Math.floor(now / 1000);
  const claims = claimsFor(kind, nowSeconds);
  const forged = kind === "wrong-signature" || kind === "expired-and-forged" || kind === "unknown-kid";
  const kid = kind === "unknown-kid" ? "qa-unknown-key" : issuer.kid;
  const key = forged ? await untrustedPrivateKey() : await trustedPrivateKey(issuer);

  const { iat, nbf, exp, roles, ...rest } = claims;
  const payload: JWTPayload = { ...rest };
  if (roles !== undefined && roles.length > 0) {
    payload["roles"] = [...roles];
  }
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid })
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setNotBefore(nbf)
    .setExpirationTime(exp)
    .sign(key);
}

/** The `Authorization` header value for a token. */
export function bearer(token: string): string {
  return `Bearer ${token}`;
}
