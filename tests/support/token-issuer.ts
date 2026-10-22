/**
 * A local issuer of operator tokens (stage plan B0, **Test seams**, *Operator
 * token*; `sds-testing`, **When it seems impossible to test first**: "Signing
 * test tokens with a key the verifier is configured to trust in tests").
 *
 * It makes one RS256 key pair, and serves the public key at the JWKS path of
 * Entra on 127.0.0.1. The app under test reads it from `ENTRA_JWKS_URI`, and
 * `tests/support/operator-token.ts` signs with the private key. The key exists
 * only while the issuer runs.
 *
 * The integration tier starts one in its global setup
 * (`tests/support/global-setup/jwks.ts`); the e2e tier starts one for each
 * Playwright worker (`tests/e2e/fixtures.ts`).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import { exportJWK, generateKeyPair } from "jose";

import { JWKS_PATH } from "./test-environment";

/** What a test needs to mint a token that the app trusts. */
export interface TestIssuer {
  /** The URL of the JWKS document. */
  readonly jwksUri: string;
  /** The `kid` of the trusted key. */
  readonly kid: string;
  /** The private key as a JSON Web Key, serialised. */
  readonly privateJwk: string;
}

export interface RunningIssuer {
  readonly issuer: TestIssuer;
  /** Stops the JWKS server. */
  close(): Promise<void>;
}

export const TRUSTED_KID = "qa-trusted-key-1";

/** Starts the JWKS server of a new key pair. */
export async function startTokenIssuer(): Promise<RunningIssuer> {
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
    server.close();
    throw new Error("The local JWKS server has no TCP port.");
  }

  return {
    issuer: {
      jwksUri: `http://127.0.0.1:${String(address.port)}${JWKS_PATH}`,
      kid: TRUSTED_KID,
      privateJwk: JSON.stringify(privateJwk),
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
