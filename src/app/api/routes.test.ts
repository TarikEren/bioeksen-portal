import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usableEnvironment } from "@/lib/config/usable-environment";

// The types of the real modules, to check the fakes below against them (review 3,
// R-050). A type position loads nothing at run time.
type DatabaseModule = typeof import("@/lib/db");
type CacheModule = typeof import("@/lib/cache");
type RateLimitModule = typeof import("@/lib/rate-limit");

// The logger writes to the database. These tests need no store.
vi.mock("@/lib/logging", () => ({
  logger: { failure: () => undefined, write: () => undefined, flush: () => Promise.resolve() },
  findLogRecords: () => Promise.reject(new Error("no store in this test")),
}));

// Nothing here reaches PostgreSQL or Redis: the answers come before any probe.
// The real modules load the Prisma runtime and the Redis client, which take 1 s
// or more to import when the disk is cold. The first test paid that cost in its
// hook and ran into the time limit under load. Fakes with the same signatures
// keep the import small and the test deterministic. `satisfies Partial<Module>`
// checks each fake against the real module, so a change of a signature fails
// the type check here (review 3, R-050).
vi.mock("@/lib/db", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    getDb: () => {
      throw new Error("no database in this test");
    },
    getPoolStats: () => ({ open: 0, inUse: 0, idle: 0 }),
    pingDatabase: () => Promise.resolve(false),
    toDatabaseError: (error: unknown) =>
      error instanceof AppError ? error : new AppError("DB-5000", "Query failed", { cause: error }),
  } satisfies Partial<DatabaseModule>;
});
vi.mock("@/lib/cache", () => ({
  pingCache: () => Promise.resolve(false),
} satisfies Partial<CacheModule>));
// The failure limit of the operator endpoints needs Redis. Here no request is limited.
vi.mock("@/lib/rate-limit", () => ({
  assertBelowLimit: () => Promise.resolve(),
  recordFailure: () => Promise.resolve(),
} satisfies Partial<RateLimitModule>));

interface Handlers {
  readonly [method: string]: ((request: NextRequest) => Promise<Response>) | undefined;
}

const environmentBefore = { ...process.env };

async function load(settings: Record<string, string>): Promise<{ health: Handlers; echo: Handlers; unknown: Handlers }> {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, settings);
  return {
    health: await import("./health/route"),
    echo: await import("./test/echo/route"),
    unknown: await import("./[[...path]]/route"),
  };
}

function call(handlers: Handlers, method: string, path: string, init: { headers?: Record<string, string> } = {}): Promise<Response> {
  const handler = handlers[method];
  if (handler === undefined) {
    throw new Error(`no export ${method}`);
  }
  return handler(new NextRequest(`http://localhost${path}`, { method, headers: init.headers }));
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, environmentBefore);
});

// Source: review 1, R-001; FND-04.AC4; FND-05 rule 4; code-prefixes.md steps 2, 10, 21.
describe("answers that Next.js would make by itself", () => {
  describe("with the test seams off", () => {
    let routes: Awaited<ReturnType<typeof load>>;

    beforeEach(async () => {
      routes = await load({ ...usableEnvironment });
    });

    it("answers OPTIONS on /api/health through the wrapper, after the credential check", async () => {
      const response = await call(routes.health, "OPTIONS", "/api/health", { headers: { "x-request-id": "abc-123" } });

      expect(response.status).toBe(401);
      expect(response.headers.get("x-request-id")).toBe("abc-123");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ status: "fail", code: "AUTH-4100" });
    });

    it("answers GET on the echo seam with 404 RES-4200, as POST does", async () => {
      for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        const response = await call(routes.echo, method, "/api/test/echo");

        expect(response.status, method).toBe(404);
        expect(response.headers.get("x-request-id"), method).not.toBeNull();
        expect(await response.json()).toMatchObject({ code: "RES-4200" });
      }
    });

    it("answers an unknown API path with 404 RES-4200 in the envelope, for every method", async () => {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        const response = await call(routes.unknown, method, "/api/unknown/path");

        expect(response.status, method).toBe(404);
        expect(response.headers.get("cache-control"), method).toBe("no-store");
        expect(response.headers.get("x-request-id"), method).not.toBeNull();
        expect(await response.json()).toMatchObject({ status: "fail", code: "RES-4200" });
      }
    });
  });

  it("answers /api itself, which has no segment after it, in the envelope too", async () => {
    const routes = await load({ ...usableEnvironment });

    for (const method of ["GET", "POST", "OPTIONS"]) {
      const response = await call(routes.unknown, method, "/api");

      expect(response.status, method).toBe(404);
      expect(response.headers.get("x-request-id"), method).not.toBeNull();
      expect(await response.json()).toMatchObject({ status: "fail", code: "RES-4200" });
    }
  });

  it("answers another method on the echo seam with 405 RES-4500 and Allow when the seams are on", async () => {
    const routes = await load({ ...usableEnvironment, TEST_SEAMS_ENABLED: "true" });

    const response = await call(routes.echo, "GET", "/api/test/echo");

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await response.json()).toMatchObject({ code: "RES-4500" });
  });
});
