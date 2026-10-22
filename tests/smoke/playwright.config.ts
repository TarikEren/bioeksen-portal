/**
 * The smoke tier (stage plan B0, task T2): Playwright against the test
 * environment that IT deployed from a release tag (DEC-128).
 *
 *   TEST_ENVIRONMENT_URL=https://portal-test.example pnpm run test:smoke
 *
 * It has no global setup and no web server: it creates no database and starts
 * no app. The base URL comes from `TEST_ENVIRONMENT_URL` only. The pull request
 * pipeline does not run this tier; the main session runs it at the stage exit.
 */
import { defineConfig } from "@playwright/test";

const environmentUrl = process.env["TEST_ENVIRONMENT_URL"];

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../test-results/smoke",
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    ...(environmentUrl === undefined || environmentUrl.trim() === "" ? {} : { baseURL: environmentUrl.trim() }),
    trace: "off",
  },
});
