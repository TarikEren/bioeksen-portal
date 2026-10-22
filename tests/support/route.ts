/**
 * Calls a route handler of the contract directly, as the integration tier
 * does (stage plan B0, **Exports that tests can call**), and reads the answer.
 */
import { NextRequest } from "next/server";
import { expect } from "vitest";

/** A route handler of a path with no dynamic segment. */
export type RouteHandler = (request: NextRequest) => Response | Promise<Response>;

/** The host of the requests. The handlers never see a network. */
export const TEST_ORIGIN = "http://localhost:3000";

export interface CallOptions {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit;
}

/** Builds the request for a path, for example `/api/health`. */
export function buildRequest(path: string, options: CallOptions = {}): NextRequest {
  const init = {
    method: options.method ?? "GET",
    headers: options.headers ?? {},
    body: options.body,
    // A stream body needs a half-duplex request in Node.js.
    duplex: "half" as const,
  };
  return new NextRequest(new URL(path, TEST_ORIGIN), init);
}

/** Calls the handler with a request for the path. */
export async function call(handler: RouteHandler, path: string, options: CallOptions = {}): Promise<Response> {
  return await handler(buildRequest(path, options));
}

/** The JSON body of an answer, or the text when it is not JSON. */
export async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
}

/** A one-line view of an answer, for a failure message. */
export function describeAnswer(response: Response, body: unknown): string {
  const shown = typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300);
  return `HTTP ${String(response.status)} ${shown}`;
}

/**
 * Asserts the error envelope of `sds-api-design` (`openapi.yaml`, `Error`):
 * the status, `status: "fail"`, the code, a message, and `details` as the code
 * defines it (`null`, or field errors for `VAL-4001` to `VAL-4007`).
 */
export async function expectEnvelope(response: Response, status: number, code: string): Promise<Record<string, unknown>> {
  const body = await readBody(response);
  expect(response.status, `expected HTTP ${String(status)} ${code}, got ${describeAnswer(response, body)}`).toBe(status);
  expect(body).toMatchObject({ status: "fail", code, message: expect.any(String) });
  if (typeof body !== "object" || body === null) {
    throw new Error("The answer has no JSON body.");
  }
  const envelope: Record<string, unknown> = { ...body };
  expect(Object.keys(envelope).sort(), "the envelope holds status, code, message and details only").toEqual(
    ["code", "details", "message", "status"],
  );
  if (/^VAL-400[1-7]$/.test(code)) {
    expect(Array.isArray(envelope["details"]), "details of a field code is an array of field errors").toBe(true);
  } else {
    expect(envelope["details"], `details of ${code} is null`).toBeNull();
  }
  return envelope;
}

/** The fields that the `details` of a field code names. */
export function detailFields(envelope: Record<string, unknown>): string[] {
  const details = envelope["details"];
  if (!Array.isArray(details)) {
    return [];
  }
  const fields: string[] = [];
  for (const entry of details) {
    if (typeof entry === "object" && entry !== null) {
      const field: unknown = Reflect.get(entry, "field");
      if (typeof field === "string") {
        fields.push(field);
      }
    }
  }
  return fields;
}

/** The format of a request id (`sds-logging`, `log-record.md`, **X-Request-Id**). */
export const REQUEST_ID_FORMAT = /^[A-Za-z0-9_-]{1,128}$/;
