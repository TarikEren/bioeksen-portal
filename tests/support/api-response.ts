/**
 * Assertions on the answers of a running app (the e2e tier), read through a
 * Playwright `APIResponse`. The integration tier calls the route handlers
 * directly and uses `route.ts`.
 */
import { type APIResponse, expect } from "@playwright/test";

/** Asserts the error envelope of `sds-api-design` (`openapi.yaml`, `Error`) on an answer of a running app. */
export async function expectAnswerEnvelope(response: APIResponse, status: number, code: string): Promise<void> {
  const text = await response.text();
  expect(response.status(), `expected HTTP ${String(status)} ${code}, got HTTP ${String(response.status())} ${text.slice(0, 300)}`).toBe(
    status,
  );
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  expect(body, "the error envelope").toMatchObject({ status: "fail", code, message: expect.any(String), details: null });
  expect(Object.keys(typeof body === "object" && body !== null ? body : {}).sort()).toEqual(["code", "details", "message", "status"]);
}
