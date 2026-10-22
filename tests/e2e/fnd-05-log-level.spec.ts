/**
 * FND-05 Errors, logs and correlation: `LOG_LEVEL`, the lowest severity the
 * in-app logger writes (FND-03 rule 2; `sds-logging`, **Bindings**; DEC-127).
 * Review 2, R-026.
 *
 * Each test starts the production build with every setting valid and one
 * value of `LOG_LEVEL`, makes the same events (start, a granted operator
 * request, a refused request), and reads the records from the app's stdout.
 * No acceptance criterion of B0 states the rule, so the titles name the
 * source.
 */
import type { APIRequestContext } from "@playwright/test";

import { type LogRecord, describeRecords } from "../support/log-records";
import { bearer, mintToken } from "../support/operator-token";
import { freePort } from "../support/ports";
import { type SpawnedApp, spawnApp, waitForRecord } from "../support/spawn-app";
import type { TestIssuer } from "../support/token-issuer";
import { configuredEnvironment, expect, test } from "./fixtures";

async function start(issuer: TestIssuer, logLevel: string | undefined): Promise<SpawnedApp> {
  const port = await freePort();
  const environment = await configuredEnvironment(port, issuer.jwksUri);
  return await spawnApp({ port, env: logLevel === undefined ? environment : { ...environment, LOG_LEVEL: logLevel } });
}

/** The same events for each app: ready, a granted operator request, and a refused request. */
async function makeEvents(request: APIRequestContext, app: SpawnedApp, issuer: TestIssuer): Promise<void> {
  await expect
    .poll(async () => (await request.get(`${app.baseUrl}/api/health/ready`)).status(), {
      timeout: 20_000,
      message: "precondition: the app reports ready",
    })
    .toBe(200);
  const authorization = bearer(await mintToken(issuer, "operator"));
  const granted = await request.get(`${app.baseUrl}/api/health`, { headers: { authorization } });
  expect(granted.status(), "precondition: the operator gets the full report").toBe(200);
  const refused = await request.get(`${app.baseUrl}/api/health`);
  expect(refused.status(), "precondition: the request without a credential is refused").toBe(401);
}

const isWarningRecord = (record: LogRecord): boolean => record.severity === "WARNING" && record.code === "AUTH-4100";

test.describe("FND-05 LOG_LEVEL", () => {
  // Source: sds-logging, SKILL.md (Bindings: LOG_LEVEL, INFO when it is unset).
  /** Without LOG_LEVEL the logger writes INFO records: the control of the case below. */
  test("FND-03 rule 2, sds-logging Bindings: without LOG_LEVEL the lowest severity written is INFO", async ({
    request,
    tokenIssuer,
  }) => {
    const app = await start(tokenIssuer, undefined);
    try {
      await makeEvents(request, app, tokenIssuer);
      expect(await waitForRecord(app, isWarningRecord), `the WARNING record of the refusal. Records:\n${describeRecords(app.records())}`).toBeDefined();

      const info = await waitForRecord(app, (record) => record.severity === "INFO");
      expect(info, `an INFO record. Records:\n${describeRecords(app.records())}`).toBeDefined();
      const debug = app.records().filter((record) => record.severity === "DEBUG");
      expect(debug, "no DEBUG record").toEqual([]);
    } finally {
      await app.stop();
    }
  });

  // Source: sds-logging, SKILL.md (Bindings) and contract-tests.md (Logging, "Level from LOG_LEVEL").
  /** With LOG_LEVEL WARNING, the same events write no INFO record, and the WARNING record is still written. */
  test("FND-03 rule 2, sds-logging Level from LOG_LEVEL: records below the level are not written", async ({
    request,
    tokenIssuer,
  }) => {
    const app = await start(tokenIssuer, "WARNING");
    try {
      await makeEvents(request, app, tokenIssuer);
      // The WARNING record of the last event is written, so the logger has handled the earlier ones too.
      expect(await waitForRecord(app, isWarningRecord), `the WARNING record of the refusal. Records:\n${describeRecords(app.records())}`).toBeDefined();

      const below = app.records().filter((record) => record.severity === "INFO" || record.severity === "DEBUG");
      expect(below, `records below WARNING. Records:\n${describeRecords(app.records())}`).toEqual([]);
    } finally {
      await app.stop();
    }
  });

  // Source: FND-03 rule 3 (a value the app cannot use is CFG-5001); sds-config (Unusable value).
  /** An unknown LOG_LEVEL is refused at start: not ready, and a FATAL CFG-5001 record names LOG_LEVEL. */
  test("FND-03 rule 3, sds-config Unusable value: an unknown LOG_LEVEL is refused at start", async ({
    request,
    tokenIssuer,
  }) => {
    const app = await start(tokenIssuer, "LOUD");
    try {
      const ready = await request.get(`${app.baseUrl}/api/health/ready`);
      expect(ready.status(), `GET /api/health/ready: ${(await ready.text()).slice(0, 300)}`).toBe(503);
      const record = await waitForRecord(
        app,
        (entry) => entry.severity === "FATAL" && entry.code === "CFG-5001" && entry.message.includes("LOG_LEVEL"),
      );
      expect(record, `a FATAL CFG-5001 record names LOG_LEVEL. Records:\n${describeRecords(app.records())}`).toBeDefined();
    } finally {
      await app.stop();
    }
  });
});
