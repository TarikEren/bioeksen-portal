/**
 * FND-02 Continuous integration: AC4, the smoke test of the test environment.
 *
 * The smoke tier (stage plan B0, task T2) runs at the stage exit, after IT
 * deploys a release tag to the test environment (DEC-128). The pull request
 * pipeline does not run it. `TEST_ENVIRONMENT_URL` gives the base URL of that
 * deployment, and `tests/smoke/playwright.config.ts` makes it the base URL.
 */
import { expect, test } from "@playwright/test";

test.describe("FND-02 test environment", () => {
  /** After IT deploys a release tag to the test environment, readiness answers 200 there. */
  test("FND-02.AC4: the deployed test environment reports ready", async ({ request, baseURL }) => {
    expect(
      baseURL,
      "TEST_ENVIRONMENT_URL is not set: give the base URL of the test environment that IT deployed",
    ).toBeTruthy();

    const response = await request.get("/api/health/ready");
    expect(response.status(), (await response.text()).slice(0, 300)).toBe(200);
  });
});
