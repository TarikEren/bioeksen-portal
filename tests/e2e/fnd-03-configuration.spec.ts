/**
 * FND-03 Configuration: AC1 to AC4.
 *
 * Each test starts the production build with one broken setting and every
 * other setting valid (`tests/e2e/fixtures.ts`), sends `GET /api/health/ready`
 * as the first request, and reads the log records from the app's stdout
 * (DEC-127). The test seam of B0 is `POST /api/test/echo`.
 */
import type { APIRequestContext } from "@playwright/test";

import { describeRecords, type LogRecord } from "../support/log-records";
import { freePort } from "../support/ports";
import { type SpawnedApp, spawnApp, waitForRecord } from "../support/spawn-app";
import { type AppEnvironment, productionEnvironment, testRedisUrl, without } from "../support/test-environment";
import { configuredEnvironment, e2eDatabaseUrl, expect, test } from "./fixtures";

async function start(build: (port: number) => Promise<AppEnvironment>): Promise<SpawnedApp> {
  const port = await freePort();
  return await spawnApp({ port, env: await build(port) });
}

async function production(port: number): Promise<AppEnvironment> {
  const base = await configuredEnvironment(port);
  return productionEnvironment({
    databaseUrl: e2eDatabaseUrl(),
    redisUrl: testRedisUrl(),
    jwksUri: base["ENTRA_JWKS_URI"] ?? "",
    publicBaseUrl: "https://portal-qa.example.invalid",
  });
}

/**
 * Asserts the readiness answer of an app that must not report ready
 * (`sds-config`): 503 with the body `status` `fail` or `not-ready`
 * (`sds-api-design`, `standard-api-endpoints.md`; stage plan B0, **API**).
 */
async function expectNotReady(request: APIRequestContext, app: SpawnedApp): Promise<void> {
  const response = await request.get(`${app.baseUrl}/api/health/ready`);
  const text = await response.text();
  expect(response.status(), `GET /api/health/ready: ${text.slice(0, 300)}`).toBe(503);
  const body: unknown = JSON.parse(text);
  const status: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "status") : undefined;
  expect(["fail", "not-ready"], `the body status of the 503: ${text.slice(0, 300)}`).toContain(status);
}

function fatalWith(code: string, setting: string): (record: LogRecord) => boolean {
  return (record) => record.severity === "FATAL" && record.code === code && record.message.includes(setting);
}

test.describe("FND-03 configuration at start", () => {
  /** Without DATABASE_URL, readiness answers 503 before any other request, and a FATAL CFG-5000 record names DATABASE_URL. */
  test("FND-03.AC1: without DATABASE_URL the app is not ready and logs FATAL CFG-5000 naming DATABASE_URL", async ({
    request,
  }) => {
    const app = await start(async (port) => without(await configuredEnvironment(port), "DATABASE_URL"));
    try {
      await expectNotReady(request, app);
      const record = await waitForRecord(app, fatalWith("CFG-5000", "DATABASE_URL"));
      expect(record, `a FATAL CFG-5000 record names DATABASE_URL. Records:\n${describeRecords(app.records())}`).toBeDefined();
    } finally {
      await app.stop();
    }
  });

  /** In production, a pepper of fewer than 32 characters: not ready, FATAL CFG-5001 names the setting, never its value. */
  test("FND-03.AC2: in production a pepper of 31 characters makes the app not ready and logs FATAL CFG-5001 without the value", async ({
    request,
  }) => {
    const shortPepper = "qa-pepper-31-characters-abcdefg";
    expect(shortPepper).toHaveLength(31);
    const app = await start(async (port) => ({ ...(await production(port)), EIFU_IDENTITY_LOOKUP_PEPPER: shortPepper }));
    try {
      await expectNotReady(request, app);
      const record = await waitForRecord(app, fatalWith("CFG-5001", "EIFU_IDENTITY_LOOKUP_PEPPER"));
      expect(
        record,
        `a FATAL CFG-5001 record names EIFU_IDENTITY_LOOKUP_PEPPER. Records:\n${describeRecords(app.records())}`,
      ).toBeDefined();
      const leaking = [...app.stdout(), ...app.stderr()].filter((line) => line.includes(shortPepper));
      expect(leaking.length, "no output line holds the value of the pepper").toBe(0);
    } finally {
      await app.stop();
    }
  });

  /** In production, a pepper of exactly 32 characters is accepted: no CFG record names the setting. */
  test("FND-03.AC2: in production a pepper of 32 characters is accepted", async () => {
    const pepper = "qa-pepper-32-characters-abcdefgh";
    expect(pepper).toHaveLength(32);
    const app = await start(async (port) => ({ ...(await production(port)), EIFU_IDENTITY_LOOKUP_PEPPER: pepper }));
    try {
      const refused = await waitForRecord(
        app,
        (record) => record.code !== null && record.code.startsWith("CFG-") && record.message.includes("EIFU_IDENTITY_LOOKUP_PEPPER"),
        5_000,
      );
      expect(refused, `no CFG record names EIFU_IDENTITY_LOOKUP_PEPPER. Records:\n${describeRecords(app.records())}`).toBeUndefined();
    } finally {
      await app.stop();
    }
  });

  /** With the test seams on in production: not ready, a FATAL CFG-5001 record, and no test seam answers. */
  test("FND-03.AC3: with TEST_SEAMS_ENABLED true in production the app is not ready, a FATAL record carries CFG-5001, and no test seam works", async ({
    request,
  }) => {
    const app = await start(async (port) => ({ ...(await production(port)), TEST_SEAMS_ENABLED: "true" }));
    try {
      await expectNotReady(request, app);
      const record = await waitForRecord(app, (entry) => entry.severity === "FATAL" && entry.code === "CFG-5001");
      expect(record, `a FATAL CFG-5001 record. Records:\n${describeRecords(app.records())}`).toBeDefined();

      const seam = await request.post(`${app.baseUrl}/api/test/echo`, { data: { value: "qa" } });
      expect(seam.status(), `the echo seam is closed: ${(await seam.text()).slice(0, 200)}`).toBe(404);
    } finally {
      await app.stop();
    }
  });

  /** Without ENTRA_ISSUER, the app is not ready, and a FATAL CFG-5000 record names the setting. */
  test("FND-03.AC4: without ENTRA_ISSUER the app is not ready and logs FATAL CFG-5000", async ({ request }) => {
    const app = await start(async (port) => without(await configuredEnvironment(port), "ENTRA_ISSUER"));
    try {
      await expectNotReady(request, app);
      const record = await waitForRecord(app, fatalWith("CFG-5000", "ENTRA_ISSUER"));
      expect(record, `a FATAL CFG-5000 record names ENTRA_ISSUER. Records:\n${describeRecords(app.records())}`).toBeDefined();
    } finally {
      await app.stop();
    }
  });
});
