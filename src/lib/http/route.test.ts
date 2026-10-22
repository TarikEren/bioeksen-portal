import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppError } from "@/lib/errors";

interface Written {
  readonly severity: string;
  readonly type: string;
  readonly code?: string;
  readonly message: string;
  readonly tail?: Record<string, string | number | boolean>;
}

const written: Written[] = [];
const failures: string[] = [];
const authentication: { outcome: "granted" | "refused" } = { outcome: "granted" };

vi.mock("@/lib/logging", () => ({
  logger: {
    write: (entry: Written) => {
      written.push(entry);
    },
    failure: (code: string) => {
      failures.push(code);
    },
  },
}));

vi.mock("@/lib/config", () => ({
  getConfigState: () => ({ status: "ready", config: {} }),
  isTestSeamEnabled: () => true,
}));

vi.mock("@/lib/auth", () => ({
  authenticateOperator: () =>
    authentication.outcome === "granted"
      ? Promise.resolve({ kind: "operator", subject: "person-1" })
      : Promise.reject(new AppError("AUTH-4101", "Credential invalid")),
}));

const { defineJsonRoute, defineRoute, okResponse } = await import("./index");

const bodySchema = z.strictObject({ value: z.string() });
const echo = defineJsonRoute({ principal: "none", bodySchema }, ({ body }) => Promise.resolve(okResponse({ value: body.value })));
const operatorRoute = defineRoute({ principal: "operator" }, () => Promise.resolve(okResponse()));

function post(body: BodyInit | null, headers: Record<string, string>): NextRequest {
  const init: RequestInit & { duplex: "half" } = { method: "POST", body, headers, duplex: "half" };
  return new NextRequest(new Request("http://localhost/api/x", init));
}

function chunked(bytes: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) {
        controller.close();
        return;
      }
      const size = Math.min(65_536, bytes - sent);
      controller.enqueue(new Uint8Array(size).fill(97));
      sent += size;
    },
  });
}

beforeEach(() => {
  written.length = 0;
  failures.length = 0;
  authentication.outcome = "granted";
});

// Source: sds-logging, What to log (each authorization decision is SECURITY); review 1, R-007.
describe("a granted operator request", () => {
  it("writes one SECURITY INFO record with no code, the subject and the path", async () => {
    const response = await operatorRoute(new NextRequest("http://localhost/api/admin/logs?page=2"));

    expect(response.status).toBe(200);
    expect(written).toEqual([
      expect.objectContaining({
        severity: "INFO",
        type: "SECURITY",
        message: "operator request granted",
        tail: { sub: "person-1", method: "GET", path: "/api/admin/logs" },
      }),
    ]);
    expect(written[0]?.code).toBeUndefined();
  });

  it("writes no granted record for a refused request, only the failure", async () => {
    authentication.outcome = "refused";

    const response = await operatorRoute(new NextRequest("http://localhost/api/admin/logs"));

    expect(response.status).toBe(401);
    expect(written).toEqual([]);
    expect(failures).toEqual(["AUTH-4101"]);
  });
});

// Source: code-prefixes.md steps 11 to 13; review 1, R-009.
describe("the body checks of a JSON route", () => {
  it("answers 413 VAL-4550 for a streamed body over 1 MiB, also with the wrong media type", async () => {
    const response = await echo(post(chunked(2 * 1_048_576), { "content-type": "text/plain" }));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "VAL-4550" });
  });

  it("answers 415 VAL-4600 for a small body with the wrong media type", async () => {
    const response = await echo(post("value", { "content-type": "text/plain" }));

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ code: "VAL-4600" });
  });

  it("answers 413 for a Content-Length over the limit before it reads, with the wrong media type", async () => {
    const response = await echo(post("x", { "content-type": "text/plain", "content-length": "9999999" }));

    expect(response.status).toBe(413);
  });

  it("answers 200 for a body that is JSON and defined", async () => {
    const response = await echo(post('{"value":"a"}', { "content-type": "application/json" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", value: "a" });
  });
});
