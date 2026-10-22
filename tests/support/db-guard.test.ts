import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseGuardError, assertDisposableDatabase } from "./db-guard";

const BASE = "postgresql://user:secret-value@localhost:5432";

// Source: FND-06 rule 4 and AC2; sds-testing, "Test databases".
describe("assertDisposableDatabase", () => {
  it("accepts a local database whose name ends in _integration", () => {
    expect(assertDisposableDatabase(`${BASE}/bioeksen_portal_main_integration`, "V", { env: {}, envFiles: [] })).toEqual({
      name: "bioeksen_portal_main_integration",
      host: "localhost",
      port: 5432,
    });
  });

  it("accepts a name that ends in _e2e for the tier e2e", () => {
    expect(assertDisposableDatabase(`${BASE}/bioeksen_portal_main_e2e`, "V", { tier: "e2e", env: {}, envFiles: [] }).name).toBe(
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
    expect(() => assertDisposableDatabase(connectionString, "V", { env: {}, envFiles: [] })).toThrow(DatabaseGuardError);
  });

  it("refuses the suffix of the other tier", () => {
    expect(() =>
      assertDisposableDatabase(`${BASE}/bioeksen_portal_main_e2e`, "V", { tier: "integration", env: {}, envFiles: [] }),
    ).toThrow(DatabaseGuardError);
  });

  it("refuses a host that is not loopback when TEST_DATABASE_HOSTS is not set", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://u:p@db.example.invalid:5432/x_integration", "V", { env: {}, envFiles: [] }),
    ).toThrow(DatabaseGuardError);
  });

  it("accepts a host that TEST_DATABASE_HOSTS names, and refuses loopback then", () => {
    const env = { TEST_DATABASE_HOSTS: "db.example.invalid" };

    expect(
      assertDisposableDatabase("postgresql://u:p@db.example.invalid:5432/x_integration", "V", { env, envFiles: [] }).host,
    ).toBe("db.example.invalid");
    expect(() => assertDisposableDatabase(`${BASE}/x_integration`, "V", { env, envFiles: [] })).toThrow(DatabaseGuardError);
  });

  it("refuses a host that the query replaces", () => {
    expect(() =>
      assertDisposableDatabase(`${BASE}/x_integration?host=db.example.invalid`, "V", { env: {}, envFiles: [] }),
    ).toThrow(DatabaseGuardError);
  });

  it("refuses the database of DATABASE_URL", () => {
    expect(() =>
      assertDisposableDatabase(`${BASE}/x_integration`, "V", {
        env: { DATABASE_URL: `${BASE}/x_integration` },
        envFiles: [],
      }),
    ).toThrow(DatabaseGuardError);
  });

  it("refuses a variable that is not set, and a text that is not a connection string", () => {
    expect(() => assertDisposableDatabase(undefined, "V", { env: {}, envFiles: [] })).toThrow(DatabaseGuardError);
    expect(() => assertDisposableDatabase("not a url", "V", { env: {}, envFiles: [] })).toThrow(DatabaseGuardError);
    expect(() => assertDisposableDatabase("mysql://u:p@localhost/x_integration", "V", { env: {}, envFiles: [] })).toThrow(
      DatabaseGuardError,
    );
  });

  it("never writes the password or the user in an error", () => {
    for (const connectionString of [`${BASE}/bioeksen_portal_dev`, `${BASE}/x_integration?host=h`]) {
      try {
        assertDisposableDatabase(connectionString, "V", { env: {}, envFiles: [] });
        expect.unreachable("The guard accepted a target that it must refuse.");
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseGuardError);
        const message = error instanceof Error ? error.message : "";
        expect(message).not.toContain("secret-value");
        expect(message).not.toContain("user:");
      }
    }
  });

  it.each([
    ["localhost and 127.0.0.1", "postgresql://u:secret-value@localhost:5432/x_integration", "postgresql://u:p@127.0.0.1:5432/x_integration"],
    ["127.0.0.1 and ::1", "postgresql://u:secret-value@127.0.0.1:5432/x_integration", "postgresql://u:p@[::1]:5432/x_integration"],
    ["::1 and localhost", "postgresql://u:secret-value@[::1]/x_integration", "postgresql://u:p@localhost:5432/x_integration"],
  ])("treats %s as one host when it compares the database of DATABASE_URL", (_label, appDatabase, target) => {
    expect(() => assertDisposableDatabase(target, "V", { env: { DATABASE_URL: appDatabase }, envFiles: [] })).toThrow(
      DatabaseGuardError,
    );
  });

  it("accepts the same name on another port of the loopback host", () => {
    const env = { DATABASE_URL: "postgresql://u:p@localhost:5433/x_integration" };

    expect(assertDisposableDatabase("postgresql://u:p@127.0.0.1:5432/x_integration", "V", { env, envFiles: [] }).port).toBe(
      5432,
    );
  });

  describe("the DATABASE_URL of the .env files", () => {
    let directory: string;

    beforeAll(() => {
      directory = mkdtempSync(path.join(os.tmpdir(), "qa-db-guard-"));
    });

    afterAll(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    function envFile(name: string, content: string): string {
      const file = path.join(directory, name);
      writeFileSync(file, content, "utf8");
      return file;
    }

    it("refuses the database that DATABASE_URL names in a .env file, and never writes its password", () => {
      const file = envFile(".env", "# local\nREDIS_URL=redis://localhost:6379\nDATABASE_URL=postgresql://u:file-secret@localhost:5432/x_integration\n");

      try {
        assertDisposableDatabase("postgresql://u:p@127.0.0.1:5432/x_integration", "V", { env: {}, envFiles: [file] });
        expect.unreachable("The guard accepted the database of DATABASE_URL in .env.");
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseGuardError);
        const message = error instanceof Error ? error.message : "";
        expect(message).not.toContain("file-secret");
        expect(message).not.toContain("postgresql://");
      }
    });

    it.each([
      ["a quoted value", '.env.local', 'DATABASE_URL="postgresql://u:p@localhost:5432/x_integration"\n'],
      ["an export prefix", '.env.test', "export DATABASE_URL=postgresql://u:p@localhost:5432/x_integration # dev\n"],
    ])("reads %s", (_label, name, content) => {
      const file = envFile(name, content);

      expect(() =>
        assertDisposableDatabase("postgresql://u:p@localhost:5432/x_integration", "V", { env: {}, envFiles: [file] }),
      ).toThrow(DatabaseGuardError);
    });

    it("accepts a target when the .env file names another database", () => {
      const file = envFile(".env.development", "DATABASE_URL=postgresql://u:p@localhost:5432/bioeksen_portal_dev\n");

      expect(
        assertDisposableDatabase("postgresql://u:p@localhost:5432/x_integration", "V", { env: {}, envFiles: [file] }).name,
      ).toBe("x_integration");
    });

    it("refuses when it cannot read the DATABASE_URL of a .env file", () => {
      const file = envFile(".env.production", "DATABASE_URL=not a connection string\n");

      expect(() =>
        assertDisposableDatabase("postgresql://u:p@localhost:5432/x_integration", "V", { env: {}, envFiles: [file] }),
      ).toThrow(DatabaseGuardError);
    });

    it("ignores .env.example, which holds no real setting", () => {
      const file = envFile(".env.example", "DATABASE_URL=postgresql://u:p@localhost:5432/x_integration\n");

      expect(
        assertDisposableDatabase("postgresql://u:p@localhost:5432/x_integration", "V", { env: {}, envFiles: [file] }).name,
      ).toBe("x_integration");
    });
  });
});
