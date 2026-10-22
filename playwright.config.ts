/**
 * The end-to-end tier (DEC-020): Playwright against `next start`.
 *
 * Build first: `pnpm run build`. The server runs the production build, with the
 * disposable database of the tier (`TEST_E2E_DATABASE_URL`, a name that ends in
 * `_e2e`) in place of `DATABASE_URL`. The global setup runs the guard, creates
 * the database empty and applies the migrations (FND-06 rules 2 and 4).
 *
 * Each worktree uses its own port, `E2E_PORT`, and its own database.
 */
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env["E2E_PORT"] ?? "3100");
const baseURL = `http://localhost:${String(port)}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/support/global-setup/playwright.ts",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start --port ${String(port)}`,
    // A port, not a URL: the probes answer 500 until the stage builds them, and
    // Playwright treats a 500 as a server that is not ready.
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    // Playwright adds these to process.env.
    env: {
      // The e2e app never reads the development database. An unset variable
      // gives an empty value, and the app then fails to start (fails closed).
      DATABASE_URL: process.env["TEST_E2E_DATABASE_URL"] ?? "",
      APP_ENV: "test",
      TEST_SEAMS_ENABLED: "true",
      PORT: String(port),
    },
  },
});
