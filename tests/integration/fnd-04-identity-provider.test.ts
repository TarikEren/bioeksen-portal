/**
 * FND-04 Standard endpoints: the identity provider is unreachable (`sds-auth`,
 * validation order step 6, `credentials.md` **Rotation and revocation**).
 *
 * This file points `ENTRA_JWKS_URI` to a port where nothing listens before
 * it loads the route handlers, so the verifier of this file holds no key and
 * cannot fetch one. Vitest loads the modules again for each file, so no other
 * file sees this setting.
 */
import { afterAll, beforeAll, describe, inject, it } from "vitest";

import { bearer, mintToken } from "../support/operator-token";
import { closedPort } from "../support/ports";
import { type RouteHandler, call, expectEnvelope } from "../support/route";

const issuer = inject("testIssuer");
const savedJwksUri = process.env["ENTRA_JWKS_URI"];
let handlers: ReadonlyArray<readonly [string, RouteHandler]> = [];

beforeAll(async () => {
  process.env["ENTRA_JWKS_URI"] = `http://127.0.0.1:${String(await closedPort())}/keys`;
  const health = await import("@/app/api/health/route");
  const logs = await import("@/app/api/admin/logs/route");
  handlers = [
    ["/api/health", health.GET],
    ["/api/admin/logs", logs.GET],
  ];
});

afterAll(() => {
  if (savedJwksUri === undefined) {
    delete process.env["ENTRA_JWKS_URI"];
  } else {
    process.env["ENTRA_JWKS_URI"] = savedJwksUri;
  }
});

describe("FND-04 standard endpoints, identity provider unreachable", () => {
  /** A token whose key the app cannot fetch, because the issuer is unreachable, gets 503 AUTH-5500. */
  it("FND-04.AC3: an operator endpoint answers 503 AUTH-5500 when the signing keys cannot be fetched", async () => {
    const authorization = bearer(await mintToken(issuer, "operator"));
    for (const [path, handler] of handlers) {
      await expectEnvelope(await call(handler, path, { headers: { authorization } }), 503, "AUTH-5500");
    }
  });
});
