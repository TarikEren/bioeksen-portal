import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";

import { assertJsonMediaType, parseJsonBytes, readBoundedBody } from "./body";

function requestOf(body: BodyInit | null, headers: HeadersInit = {}): Request {
  // Node needs `duplex` for a streamed body. The DOM type does not name it.
  const init: RequestInit & { duplex: "half" } = { method: "POST", body, headers, duplex: "half" };
  return new Request("http://localhost/api/x", init);
}

async function codeOf(action: () => unknown): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : "not an AppError";
  }
}

// Source: standard-api-endpoints.md (Method, size and media type) and
// code-prefixes.md (steps 11 to 13).
describe("the body checks", () => {
  it("accepts a body of exactly the limit and refuses one byte more with VAL-4550", async () => {
    expect((await readBoundedBody(requestOf("a".repeat(10)), 10)).byteLength).toBe(10);
    expect(await codeOf(() => readBoundedBody(requestOf("a".repeat(11)), 10))).toBe("VAL-4550");
  });

  it("refuses a Content-Length over the limit before it reads", async () => {
    const request = requestOf("a", { "content-length": "999999" });

    expect(await codeOf(() => readBoundedBody(request, 10))).toBe("VAL-4550");
  });

  it("counts a body that has no Content-Length, from a stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("aaaaaa"));
        controller.enqueue(new TextEncoder().encode("bbbbbb"));
        controller.close();
      },
    });

    expect(await codeOf(() => readBoundedBody(requestOf(stream), 10))).toBe("VAL-4550");
  });

  it("refuses a media type that is not JSON with VAL-4600", async () => {
    expect(await codeOf(() => assertJsonMediaType("text/plain"))).toBe("VAL-4600");
    expect(await codeOf(() => assertJsonMediaType(null))).toBe("VAL-4600");
    expect(await codeOf(() => assertJsonMediaType("application/json; charset=latin1"))).toBe("VAL-4600");
  });

  it("accepts application/json, also with the charset utf-8", async () => {
    expect(await codeOf(() => assertJsonMediaType("application/json"))).toBeNull();
    expect(await codeOf(() => assertJsonMediaType("Application/JSON; charset=UTF-8"))).toBeNull();
  });

  it("refuses text that is not JSON, and an empty body, with VAL-4000", async () => {
    expect(await codeOf(() => parseJsonBytes(new TextEncoder().encode("{nope")))).toBe("VAL-4000");
    expect(await codeOf(() => parseJsonBytes(new Uint8Array(0)))).toBe("VAL-4000");
    expect(await codeOf(() => parseJsonBytes(new Uint8Array([0xff, 0xfe])))).toBe("VAL-4000");
  });

  it("parses JSON in UTF-8", () => {
    expect(parseJsonBytes(new TextEncoder().encode('{"value":"ş"}'))).toEqual({ value: "ş" });
  });
});
