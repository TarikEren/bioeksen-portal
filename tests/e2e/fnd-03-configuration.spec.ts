/**
 * FND-03 Configuration: AC1 to AC5, and the demo of DEC-135.
 *
 * Each test starts the production build with one broken setting and every
 * other setting valid (`tests/e2e/fixtures.ts`), sends `GET /api/health/ready`
 * as the first request, and reads the log records from the app's stdout
 * (DEC-127). The test seam of B0 is `POST /api/test/echo`.
 *
 * The demo tests start the app with `demoEnvironment`: `APP_ENV` `demo`, the
 * other settings of production, and no `ENTRA_*` setting (DEC-135).
 */
import type { APIRequestContext } from "@playwright/test";

import { expectAnswerEnvelope } from "../support/api-response";
import { describeRecords, type LogRecord } from "../support/log-records";
import { bearer, mintToken } from "../support/operator-token";
import { freePort } from "../support/ports";
import { type SpawnedApp, spawnApp, waitForRecord } from "../support/spawn-app";
import {
  type AppEnvironment,
  demoEnvironment,
  entraSettingNames,
  productionEnvironment,
  testRedisUrl,
  without,
} from "../support/test-environment";
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

function demo(): AppEnvironment {
  return demoEnvironment({
    databaseUrl: e2eDatabaseUrl(),
    redisUrl: testRedisUrl(),
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

/** Waits until the app reports ready (`sds-config`: a usable configuration reports ready). */
async function expectReady(request: APIRequestContext, app: SpawnedApp): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await request.get(`${app.baseUrl}/api/health/ready`);
        return `HTTP ${String(response.status())} ${(await response.text()).slice(0, 300)}`;
      },
      { timeout: 20_000, message: "GET /api/health/ready reports ready" },
    )
    .toMatch(/^HTTP 200 /);
}

function fatalWith(code: string, setting: string): (record: LogRecord) => boolean {
  return (record) => record.severity === "FATAL" && record.code === code && record.message.includes(setting);
}

test.describe("FND-03 configuration at start", () => {
  // Precondition of the production cases below: each one changes one setting of this environment.
  /** The production environment of these tests, with every setting valid, reports ready. */
  test("FND-03.AC2, FND-03.AC3: precondition: the production test environment is otherwise valid", async ({
    request,
  }) => {
    const app = await start(production);
    try {
      await expectReady(request, app);
      const refused = app.records().filter((record) => record.code !== null && record.code.startsWith("CFG-"));
      expect(refused, `no CFG record. Records:\n${describeRecords(app.records())}`).toEqual([]);
    } finally {
      await app.stop();
    }
  });

  /** Without DATABASE_URL, readiness answers 503 before any other request, and a FATAL CFG-5000 record names DATABASE_URL. */
  test("FND-03.AC1: a missing DATABASE_URL is refused at start, before any request", async ({
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
  test("FND-03.AC2: in production, a pepper below the minimum length is refused at start, without its value", async ({
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
  test("FND-03.AC2: in production, a pepper of the minimum length is accepted", async ({ request }) => {
    const pepper = "qa-pepper-32-characters-abcdefgh";
    expect(pepper).toHaveLength(32);
    const app = await start(async (port) => ({ ...(await production(port)), EIFU_IDENTITY_LOOKUP_PEPPER: pepper }));
    try {
      // The check of the configuration ran once the app reports ready: an absence before then proves nothing.
      await expectReady(request, app);
      const refused = app
        .records()
        .filter((record) => record.code !== null && record.code.startsWith("CFG-") && record.message.includes("EIFU_IDENTITY_LOOKUP_PEPPER"));
      expect(refused, `no CFG record names EIFU_IDENTITY_LOOKUP_PEPPER. Records:\n${describeRecords(app.records())}`).toEqual([]);
    } finally {
      await app.stop();
    }
  });

  /** With the test seams on in production: not ready, a FATAL CFG-5001 record, and no test seam answers. */
  test("FND-03.AC3: in production, the test seams setting is refused at start, and no test seam works", async ({
    request,
  }) => {
    const app = await start(async (port) => ({ ...(await production(port)), TEST_SEAMS_ENABLED: "true" }));
    try {
      await expectNotReady(request, app);
      const record = await waitForRecord(app, fatalWith("CFG-5001", "TEST_SEAMS_ENABLED"));
      expect(record, `a FATAL CFG-5001 record names TEST_SEAMS_ENABLED. Records:\n${describeRecords(app.records())}`).toBeDefined();

      const seam = await request.post(`${app.baseUrl}/api/test/echo`, { data: { value: "qa" } });
      expect(seam.status(), `the echo seam is closed: ${(await seam.text()).slice(0, 200)}`).toBe(404);
    } finally {
      await app.stop();
    }
  });

  /** Without ENTRA_ISSUER, the app is not ready, and a FATAL CFG-5000 record names the setting. */
  test("FND-03.AC4: a missing ENTRA_ISSUER is refused at start", async ({ request }) => {
    const app = await start(async (port) => without(await configuredEnvironment(port), "ENTRA_ISSUER"));
    try {
      await expectNotReady(request, app);
      const record = await waitForRecord(app, fatalWith("CFG-5000", "ENTRA_ISSUER"));
      expect(record, `a FATAL CFG-5000 record names ENTRA_ISSUER. Records:\n${describeRecords(app.records())}`).toBeDefined();
    } finally {
      await app.stop();
    }
  });

  /** In production, without ENTRA_ISSUER, the app is not ready, and a FATAL CFG-5000 record names the setting. */
  test("FND-03.AC4: in production, a missing ENTRA_ISSUER is refused at start", async ({ request }) => {
    const app = await start(async (port) => without(await production(port), "ENTRA_ISSUER"));
    try {
      await expectNotReady(request, app);
      const record = await waitForRecord(app, fatalWith("CFG-5000", "ENTRA_ISSUER"));
      expect(record, `a FATAL CFG-5000 record names ENTRA_ISSUER. Records:\n${describeRecords(app.records())}`).toBeDefined();
    } finally {
      await app.stop();
    }
  });
});

test.describe("FND-03 the demo without the Entra settings (DEC-135)", () => {
  // Precondition of the demo cases: the helper gives APP_ENV demo and no ENTRA_* setting.
  /** The demo environment of these tests has APP_ENV demo, and no ENTRA_* setting. */
  test("FND-03.AC5: precondition: the demo test environment has no Entra setting", () => {
    const environment = demo();
    expect(environment["APP_ENV"]).toBe("demo");
    expect(entraSettingNames(environment)).toEqual([]);
    expect(environment["TEST_SEAMS_ENABLED"]).toBe("false");
  });

  /** In the demo, with no ENTRA_* setting, the app reports ready. */
  test("FND-03.AC5: the demo without the Entra settings reports ready", async ({ request }) => {
    const app = await start(async () => demo());
    try {
      await expectReady(request, app);
    } finally {
      await app.stop();
    }
  });

  // The other side of FND-03.AC4: the ENTRA_* settings are optional when APP_ENV is demo (FND-03 rule 2).
  /** In the demo, a missing ENTRA_ISSUER gives no FATAL CFG-5000 record, and no CFG record names an Entra setting. */
  test("FND-03.AC4, FND-03.AC5: in the demo, a missing ENTRA_ISSUER is not refused at start", async ({ request }) => {
    const app = await start(async () => demo());
    try {
      // The check of the configuration ran once the app reports ready: an absence before then proves nothing.
      await expectReady(request, app);
      const refused = app
        .records()
        .filter((record) => record.code !== null && record.code.startsWith("CFG-") && record.message.includes("ENTRA_"));
      expect(refused, `no CFG record names an ENTRA_* setting. Records:\n${describeRecords(app.records())}`).toEqual([]);
      expect(
        app.records().find(fatalWith("CFG-5000", "ENTRA_ISSUER")),
        `no FATAL CFG-5000 record names ENTRA_ISSUER. Records:\n${describeRecords(app.records())}`,
      ).toBeUndefined();
    } finally {
      await app.stop();
    }
  });

  // sds-auth, validation order, step 6: verification needs the identity provider, and it is not available.
  /** In the demo, with no ENTRA_* setting, GET /api/health with a bearer token answers 503 AUTH-5500. */
  test("FND-03.AC5: in the demo, GET /api/health with a bearer token answers AUTH-5500", async ({
    request,
    tokenIssuer,
  }) => {
    const app = await start(async () => demo());
    try {
      // A token that parses and is not expired, so that the steps 3 and 4 of sds-auth do not apply.
      const authorization = bearer(await mintToken(tokenIssuer, "operator"));
      const response = await request.get(`${app.baseUrl}/api/health`, { headers: { authorization } });

      await expectAnswerEnvelope(response, 503, "AUTH-5500");
    } finally {
      await app.stop();
    }
  });

  // No criterion states it. Source: DEC-135 (GET /api/admin/logs also answers 503 AUTH-5500); FND-03 rule 2.
  /** In the demo, with no ENTRA_* setting, GET /api/admin/logs with a bearer token answers 503 AUTH-5500. */
  test("FND-03 rule 2, DEC-135: in the demo, GET /api/admin/logs with a bearer token answers AUTH-5500", async ({
    request,
    tokenIssuer,
  }) => {
    const app = await start(async () => demo());
    try {
      const authorization = bearer(await mintToken(tokenIssuer, "operator"));
      const response = await request.get(`${app.baseUrl}/api/admin/logs`, { headers: { authorization } });

      await expectAnswerEnvelope(response, 503, "AUTH-5500");
    } finally {
      await app.stop();
    }
  });

  // Precondition of the next case: the probe reaches a seam that is open in APP_ENV test.
  /** In APP_ENV test with the seams on, the echo seam answers 200. */
  test("FND-03 rule 4, DEC-135: precondition: the echo seam works in the test environment", async ({
    request,
    configuredApp,
  }) => {
    const seam = await request.post(`${configuredApp.baseUrl}/api/test/echo`, { data: { value: "qa" } });
    expect(seam.status(), `the echo seam is open: ${(await seam.text()).slice(0, 200)}`).toBe(200);
  });

  // No criterion states it. Source: DEC-135 (the test seams stay closed); FND-03 rule 4 (only development or test).
  /** In the demo, the test seams stay closed, also with TEST_SEAMS_ENABLED true. */
  test("FND-03 rule 4, DEC-135: in the demo, no test seam works", async ({ request }) => {
    const app = await start(async () => ({ ...demo(), TEST_SEAMS_ENABLED: "true" }));
    try {
      const seam = await request.post(`${app.baseUrl}/api/test/echo`, { data: { value: "qa" } });
      expect(seam.status(), `the echo seam is closed: ${(await seam.text()).slice(0, 200)}`).toBe(404);
    } finally {
      await app.stop();
    }
  });
});
