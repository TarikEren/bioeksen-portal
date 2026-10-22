/**
 * FND-04 Standard endpoints: AC1 and AC4, the probes when the database does not
 * answer. The app starts with a `DATABASE_URL` that names a port where
 * nothing listens; every other setting is valid.
 */
import { closedPort, freePort } from "../support/ports";
import { type SpawnedApp, spawnApp } from "../support/spawn-app";
import { configuredEnvironment, expect, test } from "./fixtures";

let app: SpawnedApp;

test.beforeAll(async () => {
  const port = await freePort();
  const environment = await configuredEnvironment(port);
  const unreachable = new URL(environment["DATABASE_URL"] ?? "postgresql://qa@127.0.0.1/bioeksen_portal_qa_e2e");
  unreachable.hostname = "127.0.0.1";
  unreachable.port = String(await closedPort());
  app = await spawnApp({ port, env: { ...environment, DATABASE_URL: unreachable.toString() } });
});

test.afterAll(async () => {
  await app.stop();
});

test.describe("FND-04 probes without a database", () => {
  /** When the database does not answer, liveness answers 200. */
  test("FND-04.AC1: liveness does not depend on the database", async ({ request }) => {
    const response = await request.get(`${app.baseUrl}/api/health/live`);

    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  /** When the database does not answer, readiness answers 503 with the body status fail. */
  test("FND-04.AC1: readiness fails when the database does not answer", async ({
    request,
  }) => {
    const response = await request.get(`${app.baseUrl}/api/health/ready`);

    expect(response.status(), await response.text()).toBe(503);
    expect(await response.json()).toMatchObject({ status: "fail", checks: { db: "fail" } });
  });

  /** The 503 of readiness carries Cache-Control: no-store. */
  test("FND-04.AC4: the failed readiness answer carries Cache-Control: no-store", async ({ request }) => {
    const response = await request.get(`${app.baseUrl}/api/health/ready`);

    expect(response.status(), "precondition: readiness fails without the database").toBe(503);
    expect(response.headers()["cache-control"]).toBe("no-store");
  });
});
