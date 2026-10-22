/**
 * Fixtures of the end-to-end tier.
 *
 * `configuredApp` starts the production build once for each worker, with every
 * setting of FND-03 rule 2 (`tests/support/test-environment.ts`) and nothing
 * from the shell or from `.env` (`tests/support/spawn-app.ts`):
 * - PostgreSQL is the disposable e2e database (`TEST_E2E_DATABASE_URL`, a name
 *   that ends in `_e2e`); the Playwright global setup recreated it and applied
 *   the migrations;
 * - Redis is `TEST_REDIS_URL`, else the local Redis;
 * - the issuer of operator tokens points to a port where nothing listens:
 *   no end-to-end test sends one.
 */
import { test as base } from "@playwright/test";

import { assertDisposableDatabase } from "../support/db-guard";
import { closedPort, freePort } from "../support/ports";
import { type SpawnedApp, spawnApp } from "../support/spawn-app";
import { type AppEnvironment, appEnvironment, testRedisUrl } from "../support/test-environment";

/** The disposable e2e database, checked by the guard. */
export function e2eDatabaseUrl(): string {
  const connectionString = process.env["TEST_E2E_DATABASE_URL"];
  assertDisposableDatabase(connectionString, "TEST_E2E_DATABASE_URL", { tier: "e2e" });
  if (connectionString === undefined) {
    throw new Error("TEST_E2E_DATABASE_URL is not set.");
  }
  return connectionString;
}

/** A complete test environment for an app that listens on the port. */
export async function configuredEnvironment(port: number): Promise<AppEnvironment> {
  return appEnvironment({
    databaseUrl: e2eDatabaseUrl(),
    redisUrl: testRedisUrl(),
    jwksUri: `http://127.0.0.1:${String(await closedPort())}/keys`,
    publicBaseUrl: `http://127.0.0.1:${String(port)}`,
  });
}

interface WorkerFixtures {
  configuredApp: SpawnedApp;
}

export const test = base.extend<object, WorkerFixtures>({
  configuredApp: [
    async ({}, use) => {
      const port = await freePort();
      const app = await spawnApp({ port, env: await configuredEnvironment(port) });
      await use(app);
      await app.stop();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
