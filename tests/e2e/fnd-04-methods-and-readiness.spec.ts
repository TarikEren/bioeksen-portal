/**
 * FND-04 Standard endpoints: the contract cases that only a running app
 * reaches. Review 2, R-026.
 *
 * - A method that a path does not serve: Next.js answers it before any
 *   route handler that the integration tier can call, so the request goes to
 *   the production build. The stage plan (**API**) gives 405 `RES-4500` with
 *   `Allow`, after the credential check (`code-prefixes.md` step 10).
 * - `GET /api/admin/logs` of an app that is not ready: 503 `SYS-5500` in the
 *   error envelope (`sds-api-design`, `standard-api-endpoints.md`).
 *
 * FND-04 rule 1 adopts these conventions, and no criterion of FND-04 states
 * them, so the titles name their source. The `Cache-Control` of the 405 is
 * FND-04.AC4.
 */
import type { APIResponse } from "@playwright/test";

import { bearer, mintToken } from "../support/operator-token";
import { freePort } from "../support/ports";
import { spawnApp } from "../support/spawn-app";
import { without } from "../support/test-environment";
import { configuredEnvironment, expect, test } from "./fixtures";

const PROTECTED_PATHS = ["/api/health", "/api/admin/logs"] as const;
const PROBE_PATHS = ["/api/health/live", "/api/health/ready"] as const;

/** Asserts the error envelope of `sds-api-design` (`openapi.yaml`, `Error`) on an answer of a running app. */
async function expectEnvelope(response: APIResponse, status: number, code: string): Promise<void> {
  const text = await response.text();
  expect(response.status(), `expected HTTP ${String(status)} ${code}, got HTTP ${String(response.status())} ${text.slice(0, 300)}`).toBe(
    status,
  );
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  expect(body, "the error envelope").toMatchObject({ status: "fail", code, message: expect.any(String), details: null });
  expect(Object.keys(typeof body === "object" && body !== null ? body : {}).sort()).toEqual(["code", "details", "message", "status"]);
}

/** The methods of an `Allow` header, in upper case. */
function allowed(response: APIResponse): string[] {
  return (response.headers()["allow"] ?? "")
    .split(",")
    .map((method) => method.trim().toUpperCase())
    .filter((method) => method !== "");
}

test.describe("FND-04 a method that a standard path does not serve", () => {
  for (const path of PROBE_PATHS) {
    // Source: sds-logging, code-prefixes.md (step 10, RES-4500); stage plan B0, API (405 with Allow).
    /** A method the path does not serve gets 405 RES-4500 with an Allow header that names GET. */
    test(`FND-04 rule 1, sds-logging selection procedure, step 10: ${path} refuses a method it does not serve`, async ({
      request,
      configuredApp,
    }) => {
      const response = await request.post(`${configuredApp.baseUrl}${path}`, { data: {} });

      await expectEnvelope(response, 405, "RES-4500");
      expect(allowed(response), `Allow: ${response.headers()["allow"] ?? "(none)"}`).toContain("GET");
    });
  }

  for (const path of PROTECTED_PATHS) {
    // Source: sds-logging, code-prefixes.md (steps 2 and 10: the credential check comes first).
    /** Without a credential, a method the path does not serve gets 401 AUTH-4100, not 405. */
    test(`FND-04 rule 1, sds-logging selection procedure, steps 2 and 10: ${path} checks the credential before the method`, async ({
      request,
      configuredApp,
    }) => {
      const response = await request.post(`${configuredApp.baseUrl}${path}`, { data: {} });

      await expectEnvelope(response, 401, "AUTH-4100");
    });

    // Source: sds-logging, code-prefixes.md (step 10, RES-4500); stage plan B0, API (405 with Allow).
    /** With an operator token, a method the path does not serve gets 405 RES-4500 with an Allow header that names GET. */
    test(`FND-04 rule 1, sds-logging selection procedure, step 10: ${path} refuses a method it does not serve`, async ({
      request,
      configuredApp,
      tokenIssuer,
    }) => {
      const authorization = bearer(await mintToken(tokenIssuer, "operator"));
      const response = await request.post(`${configuredApp.baseUrl}${path}`, { data: {}, headers: { authorization } });

      await expectEnvelope(response, 405, "RES-4500");
      expect(allowed(response), `Allow: ${response.headers()["allow"] ?? "(none)"}`).toContain("GET");
    });
  }

  /** The 405 of each of the four endpoints carries Cache-Control: no-store. */
  test("FND-04.AC4: the refusal of a method carries Cache-Control: no-store", async ({
    request,
    configuredApp,
    tokenIssuer,
  }) => {
    const authorization = bearer(await mintToken(tokenIssuer, "operator"));
    const missing: string[] = [];
    for (const path of [...PROBE_PATHS, ...PROTECTED_PATHS]) {
      const response = await request.post(`${configuredApp.baseUrl}${path}`, { data: {}, headers: { authorization } });
      expect(response.status(), `precondition: POST ${path} is refused with 405`).toBe(405);
      const cacheControl = response.headers()["cache-control"] ?? "(none)";
      if (cacheControl !== "no-store") {
        missing.push(`POST ${path}: Cache-Control ${cacheControl}`);
      }
    }

    expect(missing, "405 answers without Cache-Control: no-store").toEqual([]);
  });
});

test.describe("FND-04 GET /api/admin/logs of an app that is not ready", () => {
  // Source: sds-api-design, standard-api-endpoints.md (GET /api/admin/logs: 503 SYS-5500 in the error envelope);
  // FND-03 rule 3 (an unusable configuration does not report ready).
  /** An app whose configuration is unusable answers GET /api/admin/logs with 503 SYS-5500 in the envelope. */
  test("FND-04 rule 1, sds-api-design GET /api/admin/logs: an app that is not ready answers SYS-5500", async ({
    request,
    tokenIssuer,
  }) => {
    const port = await freePort();
    const app = await spawnApp({
      port,
      env: without(await configuredEnvironment(port, tokenIssuer.jwksUri), "DATABASE_URL"),
    });
    try {
      const ready = await request.get(`${app.baseUrl}/api/health/ready`);
      expect(ready.status(), "precondition: the app does not report ready").toBe(503);

      const authorization = bearer(await mintToken(tokenIssuer, "operator"));
      const response = await request.get(`${app.baseUrl}/api/admin/logs`, { headers: { authorization } });

      await expectEnvelope(response, 503, "SYS-5500");
      expect(response.headers()["cache-control"], "Cache-Control of the 503").toBe("no-store");
    } finally {
      await app.stop();
    }
  });
});
