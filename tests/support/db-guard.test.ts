import { describe, expect, it } from "vitest";

import { DatabaseGuardError, assertDisposableDatabase } from "./db-guard";

const BASE = "postgresql://user:secret-value@localhost:5432";

// Source: FND-06 rule 4 and AC2; sds-testing, "Test databases".
describe("assertDisposableDatabase", () => {
  it("accepts a local database whose name ends in _integration", () => {
    expect(assertDisposableDatabase(`${BASE}/bioeksen_portal_main_integration`, "V", { env: {} })).toEqual({
      name: "bioeksen_portal_main_integration",
      host: "localhost",
      port: 5432,
    });
  });

  it("accepts a name that ends in _e2e for the tier e2e", () => {
    expect(assertDisposableDatabase(`${BASE}/bioeksen_portal_main_e2e`, "V", { tier: "e2e", env: {} }).name).toBe(
      "bioeksen_portal_main_e2e",
    );
  });

  it.each([
    ["the development database", `${BASE}/bioeksen_portal_dev`],
    ["a name with the suffix in the middle", `${BASE}/x_integration_old`],
    ["the suffix alone", `${BASE}/_integration`],
    ["a name with upper case letters", `${BASE}/Portal_integration`],
    ["a name with a quote", `${BASE}/a%22b_integration`],
    ["a name longer than 63 bytes", `${BASE}/${"a".repeat(60)}_integration`],
    ["a name with no database", `${BASE}`],
  ])("refuses %s", (_label, connectionString) => {
    expect(() => assertDisposableDatabase(connectionString, "V", { env: {} })).toThrow(DatabaseGuardError);
  });

  it("refuses the suffix of the other tier", () => {
    expect(() =>
      assertDisposableDatabase(`${BASE}/bioeksen_portal_main_e2e`, "V", { tier: "integration", env: {} }),
    ).toThrow(DatabaseGuardError);
  });

  it("refuses a host that is not loopback when TEST_DATABASE_HOSTS is not set", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://u:p@db.example.invalid:5432/x_integration", "V", { env: {} }),
    ).toThrow(DatabaseGuardError);
  });

  it("accepts a host that TEST_DATABASE_HOSTS names, and refuses loopback then", () => {
    const env = { TEST_DATABASE_HOSTS: "db.example.invalid" };

    expect(
      assertDisposableDatabase("postgresql://u:p@db.example.invalid:5432/x_integration", "V", { env }).host,
    ).toBe("db.example.invalid");
    expect(() => assertDisposableDatabase(`${BASE}/x_integration`, "V", { env })).toThrow(DatabaseGuardError);
  });

  it("refuses a host that the query replaces", () => {
    expect(() =>
      assertDisposableDatabase(`${BASE}/x_integration?host=db.example.invalid`, "V", { env: {} }),
    ).toThrow(DatabaseGuardError);
  });

  it("refuses the database of DATABASE_URL", () => {
    expect(() =>
      assertDisposableDatabase(`${BASE}/x_integration`, "V", { env: { DATABASE_URL: `${BASE}/x_integration` } }),
    ).toThrow(DatabaseGuardError);
  });

  it("refuses a variable that is not set, and a text that is not a connection string", () => {
    expect(() => assertDisposableDatabase(undefined, "V", { env: {} })).toThrow(DatabaseGuardError);
    expect(() => assertDisposableDatabase("not a url", "V", { env: {} })).toThrow(DatabaseGuardError);
    expect(() => assertDisposableDatabase("mysql://u:p@localhost/x_integration", "V", { env: {} })).toThrow(
      DatabaseGuardError,
    );
  });

  it("never writes the password or the user in an error", () => {
    for (const connectionString of [`${BASE}/bioeksen_portal_dev`, `${BASE}/x_integration?host=h`]) {
      try {
        assertDisposableDatabase(connectionString, "V", { env: {} });
        expect.unreachable("The guard accepted a target that it must refuse.");
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseGuardError);
        const message = error instanceof Error ? error.message : "";
        expect(message).not.toContain("secret-value");
        expect(message).not.toContain("user:");
      }
    }
  });
});
