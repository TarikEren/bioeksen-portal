import { afterEach, describe, expect, it, vi } from "vitest";

import { isDevelopmentServer } from ".";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Source: FND-07 rule 1; review 1 R-006 and review 2 R-028.
// The build replaces the literal process.env.NODE_ENV. These tests run the code
// as it is in source, where the literal reads the run-time value. The check of a
// built app is a run of `next start` with NODE_ENV=development (see the commit).
describe("isDevelopmentServer", () => {
  it("is true when the build is the development server", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isDevelopmentServer()).toBe(true);
  });

  it("is false for a production build, and for APP_ENV development alone", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "development");

    expect(isDevelopmentServer()).toBe(false);
  });

  it("reads the literal, so that the bundler can replace it", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");

    expect(source).toContain('process.env.NODE_ENV === "development"');
  });
});
