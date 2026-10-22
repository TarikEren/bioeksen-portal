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
