/**
 * FND-02 Continuous integration: AC5, the smoke test of the demo (DEC-135).
 *
 * A person starts `compose.demo.yaml` with the values of `.env.example` on a
 * machine with Docker, and at once runs this test with the base URL of the
 * demo in `TEST_ENVIRONMENT_URL` (`tests/README.md`, **The smoke tier against
 * the demo**). The test starts no container. It asks for readiness until the
 * demo answers 200, for at most the 3 minutes of the criterion, counted from
 * the start of the test.
 */
import { expect, test } from "@playwright/test";

/** The time of FND-02.AC5: the demo reports ready within 3 minutes. */
const READY_WITHIN_MS = 180_000;
/** The time for one readiness request. */
const REQUEST_TIMEOUT_MS = 10_000;

test.describe("FND-02 the demo", () => {
  /** After a person starts compose.demo.yaml with the values of .env.example, readiness answers 200 within 3 minutes. */
  test("FND-02.AC5: the demo reports ready within 3 minutes of its start", async ({ request, baseURL }) => {
    test.setTimeout(READY_WITHIN_MS + 2 * REQUEST_TIMEOUT_MS);
    expect(baseURL, "TEST_ENVIRONMENT_URL is not set: give the base URL of the demo that compose.demo.yaml started").toBeTruthy();

    await expect
      .poll(
        async () => {
          try {
            const response = await request.get("/api/health/ready", { timeout: REQUEST_TIMEOUT_MS });
            return `HTTP ${String(response.status())} ${(await response.text()).slice(0, 300)}`;
          } catch (error) {
            // While the containers start, the port can refuse the connection.
            return `no answer: ${error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error)}`;
          }
        },
        { timeout: READY_WITHIN_MS, message: "GET /api/health/ready of the demo answers 200 within 3 minutes" },
      )
      .toMatch(/^HTTP 200 /);
  });
});
