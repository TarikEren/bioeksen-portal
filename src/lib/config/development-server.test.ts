import { afterEach, describe, expect, it, vi } from "vitest";

const environmentBefore = { ...process.env };

async function isDevelopmentServerWith(settings: Record<string, string>): Promise<boolean> {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, settings);
  return (await import(".")).isDevelopmentServer();
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, environmentBefore);
});

// Source: FND-07 rule 1; review 1, R-006.
describe("isDevelopmentServer", () => {
  it("is true for next dev, which sets NODE_ENV to development", async () => {
    expect(await isDevelopmentServerWith({ NODE_ENV: "development" })).toBe(true);
  });

  it("is false for a production build, also when APP_ENV is development", async () => {
    expect(await isDevelopmentServerWith({ NODE_ENV: "production", APP_ENV: "development" })).toBe(false);
  });

  it("is false when NODE_ENV is not set, and for APP_ENV development alone", async () => {
    expect(await isDevelopmentServerWith({})).toBe(false);
    expect(await isDevelopmentServerWith({ APP_ENV: "development" })).toBe(false);
  });
});
