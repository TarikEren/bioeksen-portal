/**
 * FND-02 Continuous integration: AC1, AC2, AC3.
 *
 * The pipeline is the forge workflow in `.forgejo/workflows/` (`sds-ci`,
 * **Workflow definitions**), which people write from the developers'
 * proposal. These tests read it, and prove with fixtures that the checks it
 * runs fail on a broken change. That a failed check blocks the merge is a
 * branch protection setting of the forge, outside the repository.
 */
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { repositoryRoot } from "../support/paths";
import { type RepositoryCopy, copyRepository, tail } from "../support/repo-copy";
import {
  KIT_COMMIT_CHECK,
  type RunCommand,
  commitCheckGates,
  describeWorkflows,
  isCommitsJob,
  isSoftGate,
  pullRequestWorkflows,
  runCommands,
} from "../support/workflow";

function pullRequestCommands(): RunCommand[] {
  return runCommands(pullRequestWorkflows());
}

function findCommand(pattern: RegExp): RunCommand | undefined {
  return pullRequestCommands().find((command) => pattern.test(command.expanded));
}

function describeCommands(): string {
  const commands = pullRequestCommands();
  return commands.length === 0
    ? describeWorkflows()
    : commands.map((command) => `${command.workflow} > ${command.job.id} > ${command.step.name}: ${command.command}`).join("\n");
}

/** The checks of FND-02 rule 1, by the project scripts that run them (`sds-ci`, **The jobs**). */
const REQUIRED_CHECKS: ReadonlyArray<readonly [string, RegExp]> = [
  ["the type check", /\bpnpm\s+(?:run\s+)?typecheck\b/],
  ["the lint", /\bpnpm\s+(?:run\s+)?lint\b/],
  ["the unit tests", /\bpnpm\s+(?:run\s+)?test(?![\w:-])/],
  ["the production build", /\bpnpm\s+(?:run\s+)?build\b/],
  ["the integration tests", /\bpnpm\s+(?:run\s+)?test:integration\b/],
  ["the end-to-end tests", /\bpnpm\s+(?:run\s+)?test:e2e\b/],
  ["the pipeline tests", /\bpnpm\s+(?:run\s+)?test:pipeline\b/],
];

describe("FND-02 pull request pipeline", () => {
  /** A workflow in .forgejo/workflows runs on each pull request. */
  it("FND-02.AC1: a workflow in .forgejo/workflows runs on each pull request", () => {
    expect(pullRequestWorkflows().length, describeWorkflows()).toBeGreaterThan(0);
  });

  /** The pull request pipeline runs the type check, the lint, the tests and the build. */
  it("FND-02.AC1: the pull request pipeline runs the type check, the lint, every test tier and the build", () => {
    const missing = REQUIRED_CHECKS.filter(([, pattern]) => findCommand(pattern) === undefined).map(([label]) => label);

    expect(missing, `checks that no pull request step runs. Steps:\n${describeCommands()}`).toEqual([]);
  });

  /** No step of the pull request pipeline lets a failed check pass. */
  it("FND-02.AC1: a failed check fails the pull request pipeline", () => {
    const commands = pullRequestCommands();
    expect(commands.length, describeWorkflows()).toBeGreaterThan(0);

    const soft = commands.filter(isSoftGate).map((command) => `${command.job.id} > ${command.step.name}`);
    expect(soft, "steps whose failure does not fail the pipeline (continue-on-error, a || that does not exit with a failure, set +e, an if: that can skip the step)").toEqual([]);
  });

  /** The pipeline runs the sds-planning checker with --tests over the acceptance folders. */
  it("FND-02.AC2: the pull request pipeline runs the sds-planning checker with --tests over the acceptance folders", () => {
    const checker = findCommand(/check_specs\.py/);
    expect(checker, `no pull request step runs check_specs.py. Steps:\n${describeCommands()}`).toBeDefined();

    const command = checker?.expanded ?? "";
    expect(command, "the checker reads docs/specs").toMatch(/--specs\s+\.?\/?docs\/specs\b/);
    const folders = checkerTestPaths(command);
    const acceptanceFolders = readdirSync(path.join(repositoryRoot, "tests")).filter(
      (entry) => entry !== "support" && !entry.includes("."),
    );
    const uncovered = acceptanceFolders.filter(
      (folder) => !folders.some((given) => given === "tests" || given === `tests/${folder}`),
    );
    expect(uncovered, `acceptance folders that --tests ${folders.join(" ")} leaves out`).toEqual([]);
  });

  // sds-ci, "The jobs": the commits job runs the CI image's copy of the kit, under /opt/bioeksen-sds/{tag}/. Release
  // 0.9.0 of the kit has no commit-check script yet; the CI proposal names check_commits.py of sds-commit.
  /** The pipeline runs the commit check of the bioeksen-sds kit as a gate. */
  it("FND-02.AC3: the commits job of the pull request pipeline runs the commit check of the kit as a gate", () => {
    const commands = pullRequestCommands();
    const inCommitsJob = commands.filter(isCommitsJob);
    expect(inCommitsJob.length, `no pull request job is the commits job. Steps:\n${describeCommands()}`).toBeGreaterThan(0);

    const gates = commitCheckGates(commands);
    expect(
      gates.map((command) => `${command.job.id} > ${command.step.name}`),
      `no step of the commits job runs ${KIT_COMMIT_CHECK.source} as a gate. Steps:\n${describeCommands()}`,
    ).not.toEqual([]);
  });
});

/** The paths after `--tests` in a checker command, with forward slashes. */
function checkerTestPaths(command: string): string[] {
  const match = /--tests\s+((?:(?!--)\S+\s*)+)/.exec(command);
  if (match === null) return [];
  return (match[1] ?? "")
    .trim()
    .split(/\s+/)
    .map((entry) => entry.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, ""));
}

describe("FND-02 the checks fail on a broken change", () => {
  let copy: RepositoryCopy;

  // A real install: the Turbopack build refuses a node_modules linked from outside the copy.
  beforeAll(async () => {
    copy = copyRepository({ linkNodeModules: false });
    const install = await copy.pnpm(["install", "--frozen-lockfile"]);
    if (install.code !== 0) {
      throw new Error(`The copy did not install, so the fixtures cannot run: ${tail(install)}`);
    }
  });

  afterAll(() => {
    copy.remove();
  });

  /** The type check that the pipeline runs fails on a type error. */
  it("FND-02.AC1: pnpm run typecheck fails on a type error", async () => {
    copy.write("src/lib/qa-fixture/qa-type-error.ts", 'export const qaCount: number = "not a number";\n');
    const result = await copy.pnpm(["run", "typecheck"]);
    copy.delete("src/lib/qa-fixture/qa-type-error.ts");

    expect(result.code, tail(result)).not.toBe(0);
    expect(result.output, "the output names the file").toMatch(/qa-type-error\.ts/);
  });

  /** The lint that the pipeline runs fails on a lint error. */
  it("FND-02.AC1: pnpm run lint fails on a lint error", async () => {
    const file = "src/app/qa-fixture-lint/qa-lint-error.tsx";
    copy.write(
      file,
      'import { useState } from "react";\n\n' +
        "export function QaLintError({ shown }: { shown: boolean }) {\n" +
        "  if (shown) {\n    const [count] = useState(0);\n    return <p>{count}</p>;\n  }\n  return null;\n}\n",
    );
    const result = await copy.pnpm(["run", "lint", file]);
    copy.delete(file);

    expect(result.code, tail(result)).not.toBe(0);
  });

  /** The tests that the pipeline runs fail on a failed test, and pass without it. */
  it("FND-02.AC1: pnpm run test fails on a failed test", async () => {
    const passing = "tests/unit/qa-fixture-passing.test.ts";
    const failing = "tests/unit/qa-fixture-failing.test.ts";
    copy.write(passing, 'import { expect, it } from "vitest";\n\nit("qa fixture passes", () => {\n  expect(1).toBe(1);\n});\n');
    copy.write(failing, 'import { expect, it } from "vitest";\n\nit("qa fixture fails", () => {\n  expect(1).toBe(2);\n});\n');

    const control = await copy.pnpm(["run", "test", passing]);
    const result = await copy.pnpm(["run", "test", failing]);
    copy.delete(passing);
    copy.delete(failing);

    expect(control.code, `precondition: the test script passes on a passing test\n${tail(control)}`).toBe(0);
    expect(result.code, tail(result)).not.toBe(0);
  });

  /** The build that the pipeline runs fails on a page that does not compile, and passes without it. */
  it("FND-02.AC1: pnpm run build fails on a page that does not compile", async () => {
    const control = await copy.pnpm(["run", "build"]);
    expect(control.code, `precondition: the copy builds without the broken page\n${tail(control)}`).toBe(0);

    const file = "src/app/qa-fixture-build/page.tsx";
    copy.write(file, "export default function QaBroken() {\n  return <p>;\n}\n");
    const result = await copy.pnpm(["run", "build"]);
    copy.delete(file);

    expect(result.code, tail(result)).not.toBe(0);
  });

  /** The checker, run with the pipeline's arguments, fails on a test that cites a criterion that does not exist. */
  it("FND-02.AC2: the checker as the pipeline runs it fails on a citation of a criterion that does not exist", async () => {
    const checker = findCommand(/check_specs\.py/);
    expect(checker, `no pull request step runs check_specs.py. Steps:\n${describeCommands()}`).toBeDefined();
    const script = localChecker();
    expect(script, "the sds-planning checker is on this machine (SDS_PLANNING_CHECKER)").toBeDefined();

    const folders = checkerTestPaths(checker?.expanded ?? "");
    // Built at run time, so this file itself cites nothing that does not exist.
    const missingCriterion = ["FND-01", `AC${String(90 + new Date().getUTCDate())}`].join(".");
    copy.write(
      "tests/unit/qa-fixture-citation.test.ts",
      `import { it } from "vitest";\n\nit("${missingCriterion}: a criterion that does not exist", () => {});\n`,
    );
    const result = await copy.run(pythonCommand(), [script ?? "", "--specs", "docs/specs", "--tests", ...folders]);
    copy.delete("tests/unit/qa-fixture-citation.test.ts");

    expect(result.code, tail(result)).toBe(1);
    expect(result.output).toContain(missingCriterion);
  });
});

/** The sds-planning checker: `SDS_PLANNING_CHECKER`, else the newest copy of the plugin. */
function localChecker(): string | undefined {
  const configured = process.env["SDS_PLANNING_CHECKER"];
  if (configured !== undefined && existsSync(configured)) return configured;
  const cache = path.join(os.homedir(), ".claude", "plugins", "cache", "bioeksen-skills", "bioeksen-sds");
  if (!existsSync(cache)) return undefined;
  const versions = readdirSync(cache).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  for (const version of versions.reverse()) {
    const candidate = path.join(cache, version, "skills", "sds-planning", "scripts", "check_specs.py");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function pythonCommand(): string {
  return process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");
}
