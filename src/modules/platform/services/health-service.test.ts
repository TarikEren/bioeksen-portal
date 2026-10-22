import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckValue } from "@/lib/health";

const state: { db: CheckValue; cache: CheckValue; objectStore: CheckValue; smtp: CheckValue } = {
  db: "ok",
  cache: "ok",
  objectStore: "ok",
  smtp: "ok",
};
const records: string[] = [];
const configuration: { status: "ready" | "failed" } = { status: "ready" };

vi.mock("@/lib/config", () => ({
  getConfigState: () => (configuration.status === "ready" ? { status: "ready", config: {} } : { status: "failed", issues: [] }),
}));

vi.mock("@/lib/health", () => ({
  checkDatabase: () => Promise.resolve(state.db),
  checkCache: () => Promise.resolve(state.cache),
  checkObjectStore: () => Promise.resolve(state.objectStore),
  checkMailRelay: () => Promise.resolve(state.smtp),
  readDatabaseCounts: () => ({ openConnections: 2, inUseConnections: 1, idleConnections: 1 }),
  readCapacity: () =>
    Promise.resolve({
      memory: { totalHeap: 0.1, usedHeap: 0.05, totalMemory: 16, usedMemory: 8 },
      disk: { total: 500, used: 200, free: 300 },
    }),
}));

vi.mock("@/lib/logging", () => ({
  logger: {
    failure: (code: string, options?: { tail?: Record<string, string> }) => {
      records.push(`${code} ${options?.tail?.["dependency"] ?? ""}`.trim());
    },
    write: (entry: { message: string; tail?: Record<string, string> }) => {
      records.push(`${entry.message} ${entry.tail?.["dependency"] ?? ""}`.trim());
    },
  },
}));

const { fullHealth, liveness, readiness } = await import("./health-service");

// Source: FND-04 rule 2 and AC1, AC2; standard-api-endpoints.md (Further dependencies);
// sds-logging, What to log (dependency status transitions).
describe("health service", () => {
  beforeEach(() => {
    state.db = "ok";
    state.cache = "ok";
    state.objectStore = "ok";
    state.smtp = "ok";
    configuration.status = "ready";
    records.length = 0;
  });

  it("answers liveness without checking anything", () => {
    state.db = "fail";

    expect(liveness()).toEqual({ status: "ok" });
  });

  it("is ready when PostgreSQL and Redis answer", async () => {
    const report = await readiness();

    expect(report).toMatchObject({ status: "ok", checks: { db: "ok", cache: "ok", dependencies: {} } });
    expect(Number.isInteger(report.uptime)).toBe(true);
  });

  it("is not ready when the database does not answer", async () => {
    state.db = "fail";

    expect(await readiness()).toMatchObject({ status: "fail", checks: { db: "fail", cache: "ok" } });
  });

  it("is not ready when Redis does not answer", async () => {
    state.cache = "fail";

    expect(await readiness()).toMatchObject({ status: "fail", checks: { db: "ok", cache: "fail" } });
  });

  it("stays ready when only the object store and the mail relay fail, and the full report says so", async () => {
    state.objectStore = "fail";
    state.smtp = "fail";

    expect(await readiness()).toMatchObject({ status: "ok" });
    expect(await fullHealth()).toMatchObject({
      status: "ok",
      checks: { dependencies: { "object-store": "fail", smtp: "fail" } },
    });
  });

  it("reports the connection counts and the capacity in the full report", async () => {
    const report = await fullHealth();

    expect(report.checks.db).toEqual({ status: "ok", openConnections: 2, inUseConnections: 1, idleConnections: 1 });
    expect(report.checks.memory.totalMemory).toBe(16);
    expect(report.checks.disk.free).toBe(300);
  });

  it("is not ready while the configuration is unusable, and checks nothing", async () => {
    configuration.status = "failed";

    expect(await readiness()).toMatchObject({ status: "fail", checks: { db: "fail", cache: "fail", dependencies: {} } });
  });

  it("logs a change of state of a dependency once, and its return", async () => {
    await readiness();
    state.db = "fail";
    await readiness();
    await readiness();
    state.db = "ok";
    await readiness();

    expect(records).toEqual(["DB-5500 db", "dependency recovered db"]);
  });
});
