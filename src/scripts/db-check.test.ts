import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CheckFailure, resolveTarget, restoreChanged } from "./db-check";

function refusal(env: Record<string, string | undefined>): { message: string; exitCode: number } | null {
  try {
    resolveTarget(env);
    return null;
  } catch (error) {
    if (error instanceof CheckFailure) {
      return { message: error.message, exitCode: error.exitCode };
    }
    throw error;
  }
}

const url = "postgresql://user:pw-0001@127.0.0.1:5432/portal_x_integration";

// Source: FND-06 rule 4; sds-testing, Test databases; review 1, R-011.
describe("the guard of db:check", () => {
  it("takes the database of TEST_DATABASE_URL", () => {
    expect(resolveTarget({ TEST_DATABASE_URL: url }).name).toBe("portal_x_integration");
  });

  it("refuses a name that does not end in _integration", () => {
    expect(refusal({ TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/portal_dev" })?.exitCode).toBe(2);
    expect(refusal({ TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/portal_e2e" })?.exitCode).toBe(2);
  });

  it("refuses a host that is not allowed, and allows one that TEST_DATABASE_HOSTS names", () => {
    const remote = "postgresql://u:p@db.example.invalid:5432/portal_x_integration";

    expect(refusal({ TEST_DATABASE_URL: remote })?.message).toContain("TEST_DATABASE_HOSTS");
    expect(refusal({ TEST_DATABASE_URL: remote, TEST_DATABASE_HOSTS: "db.example.invalid" })).toBeNull();
  });

  it("refuses the database of DATABASE_URL", () => {
    expect(refusal({ TEST_DATABASE_URL: url, DATABASE_URL: url })?.message).toContain("DATABASE_URL");
  });

  it("never holds the connection string in a refusal", () => {
    expect(refusal({ TEST_DATABASE_URL: "postgresql://u:pw-0001@127.0.0.1:5432/portal_dev" })?.message).not.toContain(
      "pw-0001",
    );
  });
});

describe("restoreChanged", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // Source: review 1, R-012: a check must not change the tree.
  it("writes the old text back and names the files that the emit changed", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "db-check-"));
    directories.push(directory);
    writeFileSync(path.join(directory, "a.json"), "emitted a");
    writeFileSync(path.join(directory, "b.d.ts"), "same b");

    const changed = restoreChanged(directory, ["a.json", "b.d.ts"], ["old a", "same b"]);

    expect(changed).toEqual(["a.json"]);
    expect(readFileSync(path.join(directory, "a.json"), "utf8")).toBe("old a");
    expect(readFileSync(path.join(directory, "b.d.ts"), "utf8")).toBe("same b");
  });

  it("changes nothing and names nothing when the emit changed nothing", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "db-check-"));
    directories.push(directory);
    writeFileSync(path.join(directory, "a.json"), "text");

    expect(restoreChanged(directory, ["a.json"], ["text"])).toEqual([]);
  });
});
