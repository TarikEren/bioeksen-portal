/**
 * The global setup of the Vitest project `integration`: a local issuer of
 * operator tokens (stage plan B0, **Test seams**, *Operator token*).
 *
 * It makes one RS256 key pair, and serves the public key at the JWKS path of
 * Entra on 127.0.0.1. The integration setup points `ENTRA_JWKS_URI` to it, and
 * `tests/support/operator-token.ts` signs with the private key. The key exists
 * only for this run. `sds-testing`, **When it seems impossible to test
 * first**: "Signing test tokens with a key the verifier is configured to trust
 * in tests".
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import { exportJWK, generateKeyPair } from "jose";
import type { TestProject } from "vitest/node";

import { JWKS_PATH } from "../test-environment";

/** The values the test workers read with `inject("testIssuer")`. */
export interface TestIssuer {
  /** The URL of the JWKS document. */
  readonly jwksUri: string;
  /** The `kid` of the trusted key. */
  readonly kid: string;
  /** The private key as a JSON Web Key, serialised. */
  readonly privateJwk: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    testIssuer: TestIssuer;
  }
}

export const TRUSTED_KID = "qa-trusted-key-1";

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid: TRUSTED_KID, alg: "RS256", use: "sig" };
  const privateJwk = { ...(await exportJWK(privateKey)), kid: TRUSTED_KID, alg: "RS256" };
  const body = JSON.stringify({ keys: [publicJwk] });

  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === JWKS_PATH) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The local JWKS server has no TCP port.");
  }

  project.provide("testIssuer", {
    jwksUri: `http://127.0.0.1:${String(address.port)}${JWKS_PATH}`,
    kid: TRUSTED_KID,
    privateJwk: JSON.stringify(privateJwk),
  });

  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
