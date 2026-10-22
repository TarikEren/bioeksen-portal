import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isSoftGate, parseYaml, pullRequestWorkflows, runCommands } from "./workflow";

// Source: sds-ci, "Workflow definitions" and "The jobs". The reader that FND-02 and FND-07.AC5 use.
const SAMPLE = `name: ci # the pipeline
on:
  pull_request:
    branches: [main]
  push:
jobs:
  checks:
    runs-on: ci
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v4
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Types and lint
        run: |
          pnpm run typecheck
          pnpm run lint
      - name: Audit
        run: pnpm run audit:deps
        continue-on-error: true
  later:
    needs: [checks]
    steps:
    - run: "pnpm run test:e2e || true"
`;

describe("the workflow reader", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "qa-workflow-"));
    mkdirSync(path.join(root, ".forgejo", "workflows"), { recursive: true });
    writeFileSync(path.join(root, ".forgejo", "workflows", "ci.yml"), SAMPLE);
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { "audit:deps": "pnpm audit --audit-level high" } }));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads the triggers, the jobs and the steps", () => {
    const [workflow] = pullRequestWorkflows(root);

    expect(workflow?.triggers).toEqual(["pull_request", "push"]);
    expect(workflow?.jobs.map((job) => job.id)).toEqual(["checks", "later"]);
    expect(workflow?.jobs[0]?.steps.map((step) => step.name)).toEqual(["step 1", "Install", "Types and lint", "Audit"]);
  });

  it("reads block scalars and expands the project scripts", () => {
    const commands = runCommands(pullRequestWorkflows(root), root);

    expect(commands.map((command) => command.command)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm run typecheck\npnpm run lint",
      "pnpm run audit:deps",
      "pnpm run test:e2e || true",
    ]);
    expect(commands[2]?.expanded).toContain("pnpm audit --audit-level high");
  });

  it("finds the steps whose failure does not fail the pipeline", () => {
    const soft = runCommands(pullRequestWorkflows(root), root).filter(isSoftGate);

    expect(soft.map((command) => command.step.name)).toEqual(["Audit", "step 1"]);
  });

  it("parses flow sequences and quoted scalars", () => {
    expect(parseYaml('a: [x, "y"]\nb: \'q\'\n')).toEqual({ a: ["x", "y"], b: "q" });
  });
});

// Source: sds-ci, "The jobs" (a gate is never weakened) and review 2, R-039: each way a step can fail and still let
// the pull request pass.
const GATES = `on: [pull_request]
jobs:
  checks:
    steps:
      - name: or echo
        run: pnpm run lint || echo "lint failed"
      - name: or colon
        run: pnpm run typecheck || :
      - name: or exit 0
        run: pnpm run test || exit 0
      - name: or exit 1
        run: pnpm run build || exit 1
      - name: or a block that exits 2
        run: pnpm run test:integration || { echo "failed"; exit 2; }
      - name: or false
        run: pnpm run test:pipeline || false
      - name: a logical or inside a test
        run: |
          [[ -n "$CI" || -n "$FORCE" ]] && pnpm run test:e2e
      - name: or on the second line
        run: |
          pnpm install --frozen-lockfile
          pnpm audit --audit-level high || true
      - name: only on push
        if: github.event_name == 'push'
        run: pnpm run lint
      - name: the default condition
        if: \${{ success() }}
        run: pnpm run lint
      - name: always
        if: always()
        run: pnpm run lint
  main-only:
    if: github.ref == 'refs/heads/main'
    steps:
      - name: in a job that a pull request skips
        run: pnpm run build
`;

describe("the soft-gate check", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "qa-workflow-gates-"));
    mkdirSync(path.join(root, ".forgejo", "workflows"), { recursive: true });
    writeFileSync(path.join(root, ".forgejo", "workflows", "gates.yml"), GATES);
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function softness(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const command of runCommands(pullRequestWorkflows(root), root)) {
      result[command.step.name] = isSoftGate(command);
    }
    return result;
  }

  it("treats each || that does not end with a failure as soft", () => {
    expect(softness()).toMatchObject({
      "or echo": true,
      "or colon": true,
      "or exit 0": true,
      "or on the second line": true,
    });
  });

  it("keeps a || that ends with a failure, and a logical or inside a test, as a gate", () => {
    expect(softness()).toMatchObject({
      "or exit 1": false,
      "or a block that exits 2": false,
      "or false": false,
      "a logical or inside a test": false,
    });
  });

  it("treats a step or a job with a condition that can skip it as soft", () => {
    expect(softness()).toMatchObject({
      "only on push": true,
      "in a job that a pull request skips": true,
    });
  });

  it("keeps a step with the default condition, or one that always runs, as a gate", () => {
    expect(softness()).toMatchObject({
      "the default condition": false,
      always: false,
    });
  });
});
