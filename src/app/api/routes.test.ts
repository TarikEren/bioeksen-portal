import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usableEnvironment } from "@/lib/config/usable-environment";

// The logger writes to the database. These tests need no store.
vi.mock("@/lib/logging", () => ({
  logger: { failure: () => undefined, write: () => undefined, flush: () => Promise.resolve() },
  findLogRecords: () => Promise.reject(new Error("no store in this test")),
}));

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
