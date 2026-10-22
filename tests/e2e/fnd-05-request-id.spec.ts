/**
 * FND-05 Errors, logs and correlation: AC1 on the answers that no route
 * handler of the integration tier makes: an HTML page, and a path under
 * `/api` that does not exist. FND-05 rule 4: every answer carries
 * `X-Request-Id` (`sds-logging`, `log-record.md`).
 */
import { randomBytes } from "node:crypto";

import { expect, test } from "./fixtures";

/** The format of a request id (`sds-logging`, `log-record.md`, **X-Request-Id**). */
const REQUEST_ID_FORMAT = /^[A-Za-z0-9_-]{1,128}$/;

const PATHS: ReadonlyArray<readonly [string, string]> = [
  ["an HTML page", "/"],
  ["a path under /api that does not exist", "/api/qa-no-such-path"],
];

test.describe("FND-05 request id on every answer", () => {
  for (const [label, path] of PATHS) {
    /** A request with X-Request-Id gets an answer with the same value. */
    test(`FND-05.AC1: ${label} carries the X-Request-Id of its request`, async ({ request, configuredApp }) => {
      const requestId = `qa-${randomBytes(8).toString("hex")}`;
      const response = await request.get(`${configuredApp.baseUrl}${path}`, { headers: { "x-request-id": requestId } });

      expect(response.headers()["x-request-id"], `HTTP ${String(response.status())}`).toBe(requestId);
    });

    /** A request without X-Request-Id gets an answer with a new request id. */
    test(`FND-05.AC1: ${label} carries a new request id when the request has none`, async ({ request, configuredApp }) => {
      const first = await request.get(`${configuredApp.baseUrl}${path}`);
      const second = await request.get(`${configuredApp.baseUrl}${path}`);
      const firstId = first.headers()["x-request-id"] ?? "(no X-Request-Id)";
      const secondId = second.headers()["x-request-id"] ?? "(no X-Request-Id)";

      expect(firstId, `HTTP ${String(first.status())}`).toMatch(REQUEST_ID_FORMAT);
      expect(secondId, `HTTP ${String(second.status())}`).toMatch(REQUEST_ID_FORMAT);
      expect(firstId, "each request gets its own id").not.toBe(secondId);
    });
  }
});
