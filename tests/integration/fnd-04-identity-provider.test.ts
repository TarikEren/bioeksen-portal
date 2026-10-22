/**
 * FND-04 Standard endpoints: the identity provider is unreachable (`sds-auth`,
 * validation order step 6, `credentials.md` **Rotation and revocation**).
 *
 * This file points `ENTRA_JWKS_URI` to a port where nothing listens before
 * it loads the route handlers, so the verifier of this file holds no key and
 * cannot fetch one. Vitest loads the modules again for each file, so no other
 * file sees this setting.
 *
 * The same failure gives the case of a 5xxx code for the record of a failure
 * (FND-05 rule 1): its severity, type and prose.
 */
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { describeStored, openLogStore } from "../support/log-store";
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

describe("FND-05 the record of a failure with a 5xxx code", () => {
  // Source: sds-logging, code-prefixes.md (Derived attributes: severity, log type and message prose). Review 2, R-026.
  /** The record of AUTH-5500 is ERROR, SECURITY, and its message starts with the meaning of its code. */
  it("FND-05 rule 1, sds-logging Derived attributes: the record of an unreachable identity provider", async () => {
    const store = await openLogStore();
    try {
      const requestId = `qa-${randomBytes(8).toString("hex")}`;
      const authorization = bearer(await mintToken(issuer, "operator"));
      const [path, handler] = handlers[0] ?? ["/api/health", undefined];
      if (handler === undefined) {
        throw new Error("The route handlers did not load.");
      }
      await expectEnvelope(await call(handler, path, { headers: { authorization, "x-request-id": requestId } }), 503, "AUTH-5500");

      const records = await store.waitForRecordOfRequest(
        requestId,
        (record) => record.code === "AUTH-5500",
        "a record with the code AUTH-5500",
      );
      const record = records.find((entry) => entry.code === "AUTH-5500");
      expect(record, describeStored(records)).toMatchObject({ severity: "ERROR", type: "SECURITY" });
      expect(record?.message ?? "", describeStored(records)).toMatch(/^identity provider unavailable(?: [a-z0-9_]+=.*)?$/);
    } finally {
      await store.close();
    }
  });
});

describe("FND-04 standard endpoints, identity provider unreachable", () => {
  /** A token whose key the app cannot fetch, because the issuer is unreachable, gets 503 AUTH-5500. */
  it("FND-04.AC3: sds-auth validation order, step 6: the identity provider is unreachable", async () => {
    const authorization = bearer(await mintToken(issuer, "operator"));
    for (const [path, handler] of handlers) {
      await expectEnvelope(await call(handler, path, { headers: { authorization } }), 503, "AUTH-5500");
    }
  });
});
