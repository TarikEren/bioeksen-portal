import { SignJWT, generateKeyPair } from "jose";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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
// PostgreSQL and Redis answer the probes. The fakes also keep the import small (see routes.test.ts).
vi.mock("@/lib/db", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    getDb: () => {
      throw new Error("no database in this test");
    },
    getPoolStats: () => ({ open: 0, inUse: 0, idle: 0 }),
    pingDatabase: () => Promise.resolve(true),
    toDatabaseError: (error: unknown) =>
      error instanceof AppError ? error : new AppError("DB-5000", "Query failed", { cause: error }),
  } satisfies Partial<DatabaseModule>;
});
vi.mock("@/lib/cache", () => ({
  pingCache: () => Promise.resolve(true),
} satisfies Partial<CacheModule>));
// The failure limit of the operator endpoints needs Redis. Here no request is limited.
vi.mock("@/lib/rate-limit", () => ({
  assertBelowLimit: () => Promise.resolve(),
  recordFailure: () => Promise.resolve(),
} satisfies Partial<RateLimitModule>));

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

/** A token that is well formed and not expired. A demo with no identity provider cannot verify it. */
async function wellFormedToken(): Promise<string> {
  const { privateKey } = await generateKeyPair("RS256");
  return new SignJWT({ tid: "tenant-1", azp: "client", scp: "operator.access", roles: ["operator"] })
    .setProtectedHeader({ alg: "RS256", kid: "known" })
    .setSubject("person-1")
    .setIssuer("https://issuer.example.invalid")
    .setAudience("api://portal")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}

// Source: DEC-135; FND-03.AC5; FND-04 rule 1; sds-auth, Validation order, steps 2 to 4 and 6; review 3, R-049.
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
  ] as const)("answers %s by the order of sds-auth: 401 until a token can be checked, then 503 AUTH-5500", async (_name, route, path) => {
    const routes = await load(demoEnvironment);
    const token = await wellFormedToken();

    const cases: readonly { headers: Record<string, string>; status: number; code: string }[] = [
      { headers: {}, status: 401, code: "AUTH-4100" },
      { headers: { authorization: "Bearer not-a-jwt" }, status: 401, code: "AUTH-4103" },
      { headers: { authorization: `Bearer ${token}` }, status: 503, code: "AUTH-5500" },
    ];
    for (const { headers, status, code } of cases) {
      const response = await get(routes[route], path, headers);

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).not.toBeNull();
      expect(await response.json()).toMatchObject({ status: "fail", code });
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
