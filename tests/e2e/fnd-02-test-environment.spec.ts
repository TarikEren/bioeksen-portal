/**
 * FND-02 Continuous integration: AC4, the smoke test of the test environment.
 *
 * It runs at the stage exit, after IT deploys a release tag to the test
 * environment (DEC-128). `TEST_ENVIRONMENT_URL` gives the base URL of that
 * deployment, for example `https://portal-test.example`.
 */
import { expect, test } from "@playwright/test";

test.describe("FND-02 test environment", () => {
  /** After IT deploys a release tag to the test environment, readiness answers 200 there. */
  test("FND-02.AC4: GET /api/health/ready answers 200 in the test environment", async ({ request }) => {
    const baseUrl = process.env["TEST_ENVIRONMENT_URL"];
    expect(
      baseUrl,
      "TEST_ENVIRONMENT_URL is not set: give the base URL of the test environment that IT deployed",
    ).toBeTruthy();

    const response = await request.get(new URL("/api/health/ready", baseUrl).toString());
    expect(response.status(), (await response.text()).slice(0, 300)).toBe(200);
  });
});
