/**
 * FND-07 Request security: AC5, the dependency check of the pipeline.
 *
 * The audit needs the advisory database of the registry, which a test cannot
 * reach without the network. So this test reads the pull request workflow:
 * a step must run the audit at a level that a high or a critical advisory
 * fails, and the step must be a gate.
 */
import { describe, expect, it } from "vitest";

import { describeWorkflows, isSoftGate, pullRequestWorkflows, runCommands } from "../support/workflow";

const AUDIT = /\b(?:pnpm|npm)\s+audit\b([^\n]*)/;

/** True when the audit arguments fail on a high or a critical advisory. */
function failsOnHigh(argumentsText: string): boolean {
  const level = /--audit-level(?:=|\s+)(\w+)/.exec(argumentsText)?.[1];
  // Without --audit-level, every advisory fails the audit.
  return level === undefined || ["low", "moderate", "high"].includes(level);
}

describe("FND-07 dependency check", () => {
  /** The pipeline fails when a dependency has a known vulnerability of severity high or critical. */
  it("FND-07.AC5: the pull request pipeline fails on a dependency with a high or critical vulnerability", () => {
    const commands = runCommands(pullRequestWorkflows());
    const audits = commands.filter((command) => AUDIT.test(command.expanded));

    expect(audits.length, `no pull request step audits the dependencies: ${describeWorkflows()}`).toBeGreaterThan(0);
    const gates = audits.filter((command) => {
      const argumentsText = AUDIT.exec(command.expanded)?.[1] ?? "";
      return failsOnHigh(argumentsText) && !isSoftGate(command) && !/--ignore-registry-errors/.test(argumentsText);
    });
    expect(
      gates.map((command) => command.step.name),
      `an audit step that fails on high and critical advisories and is a gate, among: ${audits
        .map((command) => command.command)
        .join("; ")}`,
    ).not.toEqual([]);
  });
});
