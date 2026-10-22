/**
 * The Vitest projects, one for each tier (DEC-020, `sds-testing`).
 *
 * - `unit`: pure logic, services against fakes, route handlers called
 *   directly. No database.
 * - `component`: client components in jsdom with Testing Library.
 * - `integration`: raw SQL, constraints and transactions against a real,
 *   disposable PostgreSQL 16. The global setup runs the guard first
 *   (`tests/support/db-guard.ts`).
 * - `pipeline`: the commands of the toolchain and the lint rules, run on
 *   fixtures (FND-01, FND-02, FND-06, FND-07).
 *
 * The acceptance tests are in `tests/<tier>/`, and the developers' own tests are
 * beside the code in `src/`. The end-to-end tier is Playwright
 * (`playwright.config.ts`).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // The package throws outside a server component. A test is not one.
      { find: /^server-only$/, replacement: path.join(root, "tests/support/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${path.join(root, "src")}/` },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/support/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", "tests/component/**/*.test.tsx"],
          setupFiles: ["tests/support/setup/component.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/support/global-setup/vitest.ts"],
          setupFiles: ["tests/support/setup/integration-env.ts"],
          // One database for the worktree. The files run one after the other.
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: "pipeline",
          environment: "node",
          include: ["tests/pipeline/**/*.test.ts"],
          // A test may install and build a clean copy of the repository.
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
});
