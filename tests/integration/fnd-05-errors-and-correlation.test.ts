/**
 * FND-05 Errors, logs and correlation: AC1, AC2, AC3, AC5.
 *
 * The body checks go through the test seam `POST /api/test/echo` (stage plan
 * B0, **Test seams**): JSON `{ "value": string }`, body limit 1 MiB. The log
 * records are read from the local store `platform_log_record` (DEC-127) of the
 * disposable database.
 */
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getHealthLive } from "@/app/api/health/live/route";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as postEcho } from "@/app/api/test/echo/route";

import { type LogStore, openLogStore } from "../support/log-store";
import { REQUEST_ID_FORMAT, call, describeAnswer, detailFields, expectEnvelope, readBody } from "../support/route";

/** The body limit of FND-05 rule 7: 1 MiB. */
const BODY_LIMIT_BYTES = 1_048_576;
/** `{"value":""}`: the bytes of an echo body around its value. */
const ECHO_FRAME_BYTES = Buffer.byteLength(JSON.stringify({ value: "" }), "utf8");

const JSON_HEADERS = { "content-type": "application/json" };

function newRequestId(): string {
  return `qa-${randomBytes(8).toString("hex")}`;
}

function echoBody(valueLength: number): string {
  return JSON.stringify({ value: "a".repeat(valueLength) });
}

let store: LogStore;

beforeAll(async () => {
  store = await openLogStore();
});

afterAll(async () => {
  await store.close();
});

describe("FND-05 request id", () => {
  /** A request without X-Request-Id gets an answer with a new request id. */
  it("FND-05.AC1: an answer to a request without X-Request-Id carries a new request id", async () => {
    const first = await call(getHealthLive, "/api/health/live");
    const second = await call(getHealthLive, "/api/health/live");
    const firstId = first.headers.get("x-request-id") ?? "(no X-Request-Id)";
    const secondId = second.headers.get("x-request-id") ?? "(no X-Request-Id)";

    expect(firstId, "the first answer carries X-Request-Id").toMatch(REQUEST_ID_FORMAT);
    expect(secondId, "the second answer carries X-Request-Id").toMatch(REQUEST_ID_FORMAT);
    expect(firstId, "each request gets its own id").not.toBe(secondId);
  });

  /** A request with X-Request-Id gets an answer with the same value. */
  it("FND-05.AC1: an answer carries the X-Request-Id of its request", async () => {
    const requestId = newRequestId();
    const response = await call(getHealthLive, "/api/health/live", { headers: { "x-request-id": requestId } });

    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  /** A failure answer also carries the X-Request-Id of its request. */
  it("FND-05.AC1: a failure answer carries the X-Request-Id of its request", async () => {
    const requestId = newRequestId();
    const response = await call(getHealth, "/api/health", { headers: { "x-request-id": requestId } });

    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.status, "precondition: the request without a credential fails").toBe(401);
  });

  // The format of sds-logging, log-record.md (X-Request-Id): [A-Za-z0-9_-], 1 to 128 characters.
  /** A request id at the longest length of the format is adopted as it is. */
  it("FND-05.AC1: a request id of the longest valid length is adopted", async () => {
    const requestId = `qa-${randomBytes(64).toString("hex")}`.slice(0, 128);
    expect(requestId).toHaveLength(128);
    const response = await call(getHealthLive, "/api/health/live", { headers: { "x-request-id": requestId } });

    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  // Contract case "Replaced" (sds-logging, log-record.md): a malformed id is never adopted.
  /** A malformed X-Request-Id is not adopted: the request succeeds with a new id. */
  it("FND-05.AC1: a malformed X-Request-Id is replaced by a new request id", async () => {
    for (const malformed of ["bad id!", "x".repeat(129)]) {
      const response = await call(getHealthLive, "/api/health/live", { headers: { "x-request-id": malformed } });
      const returned = response.headers.get("x-request-id") ?? "(no X-Request-Id)";

      expect(returned, `the answer to "${malformed.slice(0, 20)}" carries a request id`).toMatch(REQUEST_ID_FORMAT);
      expect(returned).not.toBe(malformed);
      expect(response.status, "the request still succeeds").toBe(200);
    }
  });
});

describe("FND-05 failure codes in the log", () => {
  async function expectLoggedWithCode(requestId: string, code: string): Promise<void> {
    await expect
      .poll(async () => (await store.recordsOfRequest(requestId)).map((record) => record.code), {
        timeout: 10_000,
        interval: 200,
        message: `a record with request=${requestId} and the code ${code} is in platform_log_record`,
      })
      .toContain(code);
    const otherCodes = (await store.recordsOfRequest(requestId))
      .map((record) => record.code)
      .filter((logged) => logged !== null && logged !== code);
    expect(otherCodes, "no record of the request carries another code").toEqual([]);
  }

  /** A failed request's answer code equals its log record's code, and both carry its request id. */
  it("FND-05.AC2: a refused request is logged with the code of its answer and its request id", async () => {
    const requestId = newRequestId();
    const response = await call(getHealth, "/api/health", { headers: { "x-request-id": requestId } });
    const envelope = await expectEnvelope(response, 401, "AUTH-4100");

    expect(response.headers.get("x-request-id")).toBe(requestId);
    await expectLoggedWithCode(requestId, String(envelope["code"]));
  });

  /** A failed request's answer code equals its log record's code, and both carry its request id. */
  it("FND-05.AC2: an invalid body is logged with the code of its answer and its request id", async () => {
    const requestId = newRequestId();
    const response = await call(postEcho, "/api/test/echo", {
      method: "POST",
      headers: { ...JSON_HEADERS, "x-request-id": requestId },
      body: JSON.stringify({ value: "qa", qaUnknownField: 1 }),
    });
    const envelope = await expectEnvelope(response, 400, "VAL-4007");

    expect(response.headers.get("x-request-id")).toBe(requestId);
    await expectLoggedWithCode(requestId, String(envelope["code"]));
  });
});

describe("FND-05 request bodies", () => {
  /** A body with only the defined field is accepted: the seam echoes the value. */
  it("FND-05.AC3: a body with only the defined fields is accepted", async () => {
    const response = await call(postEcho, "/api/test/echo", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ value: "qa-value" }),
    });
    const body = await readBody(response);

    expect(response.status, describeAnswer(response, body)).toBe(200);
    expect(body).toEqual({ status: "ok", value: "qa-value" });
  });

  /** A body with a field the endpoint does not define gets 400 VAL-4007, and details names the field. */
  it("FND-05.AC3: a body field that the endpoint does not define is refused and named", async () => {
    const response = await call(postEcho, "/api/test/echo", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ value: "qa-value", qaUnknownField: true }),
    });
    const envelope = await expectEnvelope(response, 400, "VAL-4007");

    expect(detailFields(envelope)).toEqual(["qaUnknownField"]);
  });

  // Contract case "First fault wins" (sds-logging, error-codes.md and code-prefixes.md steps 14 and 20).
  /** With a missing field and an unknown field, the code is VAL-4001, and details names both fields. */
  it("FND-05.AC3: a missing field comes before an unknown field, and details names both", async () => {
    const response = await call(postEcho, "/api/test/echo", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ qaUnknownField: "x" }),
    });
    const envelope = await expectEnvelope(response, 400, "VAL-4001");

    expect(detailFields(envelope).sort()).toEqual(["qaUnknownField", "value"]);
  });

  // Contract case of the route wrapper (code-prefixes.md step 13): a body that does not parse.
  /** A body that is not JSON gets 400 VAL-4000. */
  it("FND-05.AC3: sds-logging selection procedure, step 13: a body that does not parse", async () => {
    const response = await call(postEcho, "/api/test/echo", {
      method: "POST",
      headers: JSON_HEADERS,
      body: '{"value": "qa"',
    });
    await expectEnvelope(response, 400, "VAL-4000");
  });

  // Contract case "Invalid field value" (sds-logging, code-prefixes.md step 19). Review 2, R-026.
  /** A body field of the wrong type gets 400 VAL-4006, and details names the field. */
  it("FND-05 rule 2, sds-logging selection procedure, step 19: a body field of the wrong type", async () => {
    const response = await call(postEcho, "/api/test/echo", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ value: 42 }),
    });
    const envelope = await expectEnvelope(response, 400, "VAL-4006");

    expect(detailFields(envelope)).toEqual(["value"]);
  });

  /** A body of exactly 1 MiB is inside the limit: the seam echoes it. */
  it("FND-05.AC5: a body at the limit is accepted", async () => {
    const valueLength = BODY_LIMIT_BYTES - ECHO_FRAME_BYTES;
    const body = echoBody(valueLength);
    expect(Buffer.byteLength(body, "utf8")).toBe(BODY_LIMIT_BYTES);

    const response = await call(postEcho, "/api/test/echo", { method: "POST", headers: JSON_HEADERS, body });
    const answer = await readBody(response);

    expect(response.status, describeAnswer(response, answer)).toBe(200);
    expect(answer).toMatchObject({ status: "ok", value: expect.any(String) });
    const value = typeof answer === "object" && answer !== null ? Reflect.get(answer, "value") : undefined;
    expect(typeof value === "string" ? value.length : -1).toBe(valueLength);
  });

  /** A body one byte over 1 MiB gets 413 VAL-4550. */
  it("FND-05.AC5: a body over the limit is refused", async () => {
    const body = echoBody(BODY_LIMIT_BYTES - ECHO_FRAME_BYTES + 1);
    expect(Buffer.byteLength(body, "utf8")).toBe(BODY_LIMIT_BYTES + 1);

    const response = await call(postEcho, "/api/test/echo", { method: "POST", headers: JSON_HEADERS, body });
    await expectEnvelope(response, 413, "VAL-4550");
  });

  // Contract case "Understated length" (sds-api-design, standard-api-endpoints.md): the limit counts the bytes that arrive.
  /** A streamed body over 1 MiB, with no Content-Length, gets 413 VAL-4550. */
  it("FND-05.AC5: the limit counts the bytes that arrive, not Content-Length", async () => {
    const chunk = new TextEncoder().encode("a".repeat(64 * 1024));
    const chunks = Math.ceil((BODY_LIMIT_BYTES + 1) / chunk.byteLength) + 1;
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
      },
      pull(controller) {
        if (sent >= chunks) {
          controller.enqueue(new TextEncoder().encode('"}'));
          controller.close();
          return;
        }
        sent += 1;
        controller.enqueue(chunk);
      },
    });

    const response = await call(postEcho, "/api/test/echo", { method: "POST", headers: JSON_HEADERS, body: stream });
    await expectEnvelope(response, 413, "VAL-4550");
  });
});
