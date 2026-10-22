/**
 * FND-04 Standard endpoints: AC2, AC3, AC4, and the auth cases of the
 * principals that FND-04 rule 1 adopts from `sds-auth`.
 *
 * Environment (tests/support/setup/integration-env.ts): PostgreSQL and Redis
 * answer; the object store and the mail relay do not; operator tokens come
 * from the local issuer.
 */
import { describe, expect, inject, it } from "vitest";

import { GET as getAdminLogs } from "@/app/api/admin/logs/route";
import { GET as getHealthLive } from "@/app/api/health/live/route";
import { GET as getHealthReady } from "@/app/api/health/ready/route";
import { GET as getHealth } from "@/app/api/health/route";

import { type TokenKind, bearer, mintToken } from "../support/operator-token";
import { type RouteHandler, call, describeAnswer, expectEnvelope, readBody } from "../support/route";

const issuer = inject("testIssuer");

async function withToken(kind: TokenKind): Promise<Record<string, string>> {
  return { authorization: bearer(await mintToken(issuer, kind)) };
}

const PROTECTED: ReadonlyArray<readonly [string, RouteHandler]> = [
  ["/api/health", getHealth],
  ["/api/admin/logs", getAdminLogs],
];

/** Claim names a rejection must not reveal (`sds-auth`, **What a rejection may say**). */
const CLAIM_WORDS = /\b(aud|audience|iss|issuer|tid|tenant|scp|scope|kid|signature|jwks|azp)\b/i;

async function expectRejection(response: Response, status: number, code: string): Promise<void> {
  const envelope = await expectEnvelope(response, status, code);
  const message = envelope["message"];
  expect(typeof message === "string" && CLAIM_WORDS.test(message), `the message names no claim: ${String(message)}`).toBe(
    false,
  );
}

describe("FND-04 standard endpoints, dependencies", () => {
  /** With PostgreSQL and Redis up and the object store and mail relay down, readiness answers 200. */
  it("FND-04.AC2: readiness answers 200 when only the object store and the mail relay are down", async () => {
    const response = await call(getHealthReady, "/api/health/ready");
    const body = await readBody(response);

    expect(response.status, describeAnswer(response, body)).toBe(200);
    expect(body).toMatchObject({ status: "ok", checks: { db: "ok", cache: "ok" } });
  });

  /** With only the object store and mail relay down, the full report answers 200 ok, with object-store and smtp fail. */
  it("FND-04.AC2: the full report answers 200 ok and gives object-store and smtp as fail", async () => {
    const response = await call(getHealth, "/api/health", { headers: await withToken("operator") });
    const body = await readBody(response);

    expect(response.status, describeAnswer(response, body)).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: { db: { status: "ok" }, cache: "ok", dependencies: { "object-store": "fail", smtp: "fail" } },
    });
  });
});

describe("FND-04 standard endpoints, operator credential", () => {
  for (const [path, handler] of PROTECTED) {
    /** A request without an Authorization header gets 401 AUTH-4100. */
    it(`FND-04.AC3: ${path} without an Authorization header answers 401 AUTH-4100`, async () => {
      await expectRejection(await call(handler, path), 401, "AUTH-4100");
    });

    // Contract cases of the validation order (sds-auth, SKILL.md and credentials.md), adopted by FND-04 rule 1.

    /** An Authorization header without the Bearer scheme counts as no credential: 401 AUTH-4100. */
    it(`FND-04.AC3: ${path} with a scheme that is not Bearer answers 401 AUTH-4100`, async () => {
      const response = await call(handler, path, { headers: { authorization: "Basic cWE6cWE=" } });
      await expectRejection(response, 401, "AUTH-4100");
    });

    /** A bearer value that is not a JWT gets 401 AUTH-4103. */
    it(`FND-04.AC3: ${path} with a token that does not parse answers 401 AUTH-4103`, async () => {
      const response = await call(handler, path, { headers: { authorization: "Bearer not-a-jwt" } });
      await expectRejection(response, 401, "AUTH-4103");
    });

    /** A token whose exp passed beyond the skew allowance gets 401 AUTH-4102. */
    it(`FND-04.AC3: ${path} with an expired token answers 401 AUTH-4102`, async () => {
      await expectRejection(await call(handler, path, { headers: await withToken("expired") }), 401, "AUTH-4102");
    });

    /** Expiry is checked before the signature: an expired forged token gets 401 AUTH-4102. */
    it(`FND-04.AC3: ${path} with an expired token that is also forged answers 401 AUTH-4102`, async () => {
      const response = await call(handler, path, { headers: await withToken("expired-and-forged") });
      await expectRejection(response, 401, "AUTH-4102");
    });

    for (const kind of ["wrong-signature", "wrong-audience", "wrong-issuer", "wrong-tenant"] as const) {
      /** An unexpired token with a bad signature or a claim that does not match gets 401 AUTH-4101. */
      it(`FND-04.AC3: ${path} with a token of the kind "${kind}" answers 401 AUTH-4101`, async () => {
        await expectRejection(await call(handler, path, { headers: await withToken(kind) }), 401, "AUTH-4101");
      });
    }

    for (const kind of ["app", "person-without-role", "role-without-scope"] as const) {
      /** An authenticated caller who is not an operator gets 403 PERM-4151. */
      it(`FND-04.AC3: ${path} with a token of the kind "${kind}" answers 403 PERM-4151`, async () => {
        await expectRejection(await call(handler, path, { headers: await withToken(kind) }), 403, "PERM-4151");
      });
    }
  }
});

describe("FND-04 standard endpoints, caching", () => {
  async function expectNoStore(response: Response, label: string): Promise<void> {
    const body = await readBody(response);
    expect(response.headers.get("cache-control"), `${label}: ${describeAnswer(response, body)}`).toBe("no-store");
  }

  /** Every answer of GET /api/health/live carries Cache-Control: no-store. */
  it("FND-04.AC4: GET /api/health/live answers with Cache-Control: no-store", async () => {
    await expectNoStore(await call(getHealthLive, "/api/health/live"), "live");
  });

  /** Every answer of GET /api/health/ready carries Cache-Control: no-store. */
  it("FND-04.AC4: GET /api/health/ready answers with Cache-Control: no-store", async () => {
    await expectNoStore(await call(getHealthReady, "/api/health/ready"), "ready");
  });

  /** The 200 and the 401 of GET /api/health carry Cache-Control: no-store. */
  it("FND-04.AC4: GET /api/health answers with Cache-Control: no-store, also when it refuses", async () => {
    const refused = await call(getHealth, "/api/health");
    await expectNoStore(refused, "health without a credential");
    expect(refused.status, "precondition: the request without a credential is refused").toBe(401);

    const report = await call(getHealth, "/api/health", { headers: await withToken("operator") });
    await expectNoStore(report, "health with an operator token");
    expect(report.status, "precondition: the operator gets the report").toBe(200);
  });

  /** The 200 and the 401 of GET /api/admin/logs carry Cache-Control: no-store. */
  it("FND-04.AC4: GET /api/admin/logs answers with Cache-Control: no-store, also when it refuses", async () => {
    const refused = await call(getAdminLogs, "/api/admin/logs");
    await expectNoStore(refused, "logs without a credential");
    expect(refused.status, "precondition: the request without a credential is refused").toBe(401);

    const page = await call(getAdminLogs, "/api/admin/logs", { headers: await withToken("operator") });
    await expectNoStore(page, "logs with an operator token");
    expect(page.status, "precondition: the operator gets a page of logs").toBe(200);
  });
});
