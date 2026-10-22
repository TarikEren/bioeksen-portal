import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usableEnvironment } from "@/lib/config/usable-environment";

// The logger writes to the database. These tests need no store.
vi.mock("@/lib/logging", () => ({
  logger: { failure: () => undefined, write: () => undefined, flush: () => Promise.resolve() },
  findLogRecords: () => Promise.reject(new Error("no store in this test")),
}));
// PostgreSQL and Redis answer. The fakes also keep the import small (see routes.test.ts).
vi.mock("@/lib/db", () => ({
  getDb: () => {
    throw new Error("no database in this test");
  },
  getPoolStats: () => ({ open: 0, inUse: 0, idle: 0 }),
  pingDatabase: () => Promise.resolve(true),
  toDatabaseError: (error: unknown) => error,
}));
vi.mock("@/lib/cache", () => ({
  pingCache: () => Promise.resolve(true),
}));

type Handler = (request: NextRequest) => Promise<Response>;

interface Routes {
  readonly ready: Handler;
  readonly health: Handler;
  readonly logs: Handler;
  readonly echo: { readonly POST: Handler };
}

const environmentBefore = { ...process.env };

/** A demo with no identity setting: the demo of DEC-135 before IT gives the Entra values. */
const demoEnvironment: Record<string, string> = {
  ...Object.fromEntries(Object.entries(usableEnvironment).filter(([name]) => !name.startsWith("ENTRA_"))),
  APP_ENV: "demo",
  TRUSTED_PROXIES: "127.0.0.1",
  EIFU_IDENTITY_KEYS: `demo-1:${Buffer.alloc(32, 7).toString("base64")}`,
  EIFU_IDENTITY_LOOKUP_PEPPER: "p".repeat(32),
};

async function load(settings: Record<string, string>): Promise<Routes> {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, settings);
  const [ready, health, logs, echo] = await Promise.all([
    import("./health/ready/route"),
    import("./health/route"),
    import("./admin/logs/route"),
    import("./test/echo/route"),
  ]);
  return { ready: ready.GET, health: health.GET, logs: logs.GET, echo: { POST: echo.POST } };
}

function get(handler: Handler, path: string, headers: Record<string, string> = {}): Promise<Response> {
  return handler(new NextRequest(`http://localhost${path}`, { method: "GET", headers }));
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, environmentBefore);
});

// Source: DEC-135; FND-03.AC5; FND-04 rule 1; sds-auth, Validation order, step 6.
describe("the demo without an identity provider", () => {
  it("reports ready", async () => {
    const routes = await load(demoEnvironment);

    const response = await get(routes.ready, "/api/health/ready");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it.each([
    ["GET /api/health", "health", "/api/health"],
    ["GET /api/admin/logs", "logs", "/api/admin/logs"],
  ] as const)("answers 503 AUTH-5500 at %s, with a bearer token and without one", async (_name, route, path) => {
    const routes = await load(demoEnvironment);

    const callers: Record<string, string>[] = [{ authorization: "Bearer not-checked" }, {}];
    for (const headers of callers) {
      const response = await get(routes[route], path, headers);

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).not.toBeNull();
      expect(await response.json()).toMatchObject({ status: "fail", code: "AUTH-5500" });
    }
  });

  it("keeps the test seams closed when TEST_SEAMS_ENABLED is true", async () => {
    const routes = await load({ ...demoEnvironment, TEST_SEAMS_ENABLED: "true" });

    const response = await routes.echo.POST(
      new NextRequest("http://localhost/api/test/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "RES-4200" });
  });

  it("does not report ready when TEST_SEAMS_ENABLED is true", async () => {
    const routes = await load({ ...demoEnvironment, TEST_SEAMS_ENABLED: "true" });

    expect((await get(routes.ready, "/api/health/ready")).status).toBe(503);
  });
});
