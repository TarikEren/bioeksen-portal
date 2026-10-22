/**
 * The end-to-end tier (DEC-020): Playwright against `next start`.
 *
 * Build first: `pnpm run build`. The global setup runs the guard, creates the
 * disposable database of the tier (`TEST_E2E_DATABASE_URL`, a name that ends
 * in `_e2e`) empty and applies the migrations (FND-06 rules 2 and 4).
 *
 * There is no web server here. Each test file starts the production build
 * itself with `tests/support/spawn-app.ts`, on a free port and with exactly
 * the settings of the test, never the shell's variables or `.env`.
 *
 * The smoke tier has its own configuration, `tests/smoke/playwright.config.ts`.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/support/global-setup/playwright.ts",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
