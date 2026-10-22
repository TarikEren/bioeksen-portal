import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SOFTWARE_ID_SETTING, evaluateConfig, withSoftwareId } from ".";
import { readSoftwareId } from "./software-id";
import { usableEnvironment } from "./usable-environment";

const directories: string[] = [];

function project(idFile: string | null): string {
  const directory = mkdtempSync(path.join(tmpdir(), "software-id-"));
  directories.push(directory);
  if (idFile !== null) {
    mkdirSync(path.join(directory, ".bioeksen"));
    writeFileSync(path.join(directory, ".bioeksen", "software-id"), idFile);
  }
  return directory;
}

function codeOf(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof Error ? String(Reflect.get(error, "code")) : "not an error";
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Source: log-record.md, Allocating an id; sds-config (validate before ready); review 1, R-013.
describe("the software id", () => {
  it("reads the id of the nearest file above the directory, without the surrounding whitespace", () => {
    const root = project("bioeksen-portal\n");
    const nested = path.join(root, "a", "b");
    mkdirSync(nested, { recursive: true });

    expect(readSoftwareId(nested)).toBe("bioeksen-portal");
  });

  it("gives CFG-5000 when no file holds an id, and when the file is empty", () => {
    expect(codeOf(() => readSoftwareId(project(null)))).toBe("CFG-5000");
    expect(codeOf(() => readSoftwareId(project("  \n")))).toBe("CFG-5000");
  });

  it("gives CFG-5001 for an id of a form that is not allowed", () => {
    expect(codeOf(() => readSoftwareId(project("Bioeksen_Portal")))).toBe("CFG-5001");
    expect(codeOf(() => readSoftwareId(project("a".repeat(64))))).toBe("CFG-5001");
  });

  it("keeps the app from reporting ready when the id is missing", () => {
    const ready = evaluateConfig(usableEnvironment);

    expect(withSoftwareId(ready, project("bioeksen-portal")).status).toBe("ready");
    expect(withSoftwareId(ready, project(null))).toEqual({
      status: "failed",
      issues: [{ setting: SOFTWARE_ID_SETTING, code: "CFG-5000", reason: "not supplied" }],
    });
  });

  it("adds the id to the settings that already failed", () => {
    const failed = evaluateConfig({ ...usableEnvironment, DATABASE_URL: "" });
    const state = withSoftwareId(failed, project("Bad_Id"));

    expect(state.status === "failed" ? state.issues.map((issue) => [issue.setting, issue.code]) : []).toEqual([
      ["DATABASE_URL", "CFG-5001"],
      [SOFTWARE_ID_SETTING, "CFG-5001"],
    ]);
  });
});
