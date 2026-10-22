/**
 * Reads the forge workflows of the repository (FND-02, FND-07.AC5).
 *
 * `sds-ci` fixes the place: `.forgejo/workflows/`, the only workflow
 * directory. People write these files; the tests read them to prove that the
 * pull request pipeline runs each check of FND-02 as a gate.
 *
 * The reader understands the block YAML that workflows use: mappings,
 * sequences, plain and quoted scalars, flow sequences of scalars, and block
 * scalars (`|`, `>`). It does not resolve anchors.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./paths";

export type YamlNode = string | YamlNode[] | { readonly [key: string]: YamlNode };

interface Line {
  readonly indent: number;
  readonly text: string;
  readonly raw: string;
}

function stripComment(text: string): string {
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (index === 0 || text[index - 1] === " ")) {
      return text.slice(0, index).trimEnd();
    }
  }
  return text.trimEnd();
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function scalar(value: string): YamlNode {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((item) => unquote(item));
  }
  if (trimmed === "{}") {
    return {};
  }
  return unquote(trimmed);
}

/** The index of the colon that ends a mapping key, or -1. */
function keyColon(text: string): number {
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ":" && (index === text.length - 1 || text[index + 1] === " ")) {
      return index;
    }
  }
  return -1;
}

class Parser {
  private position = 0;

  private readonly lines: Line[];

  constructor(lines: readonly Line[]) {
    this.lines = [...lines];
  }

  parse(): YamlNode {
    return this.block(0);
  }

  private peek(): Line | undefined {
    return this.lines[this.position];
  }

  private block(indent: number): YamlNode {
    const first = this.peek();
    if (first === undefined || first.indent < indent) {
      return "";
    }
    if (first.text.startsWith("- ") || first.text === "-") {
      return this.sequence(first.indent);
    }
    return this.mapping(first.indent);
  }

  private blockScalar(parentIndent: number, style: string): string {
    const collected: string[] = [];
    let contentIndent = -1;
    while (this.position < this.lines.length) {
      const line = this.lines[this.position];
      if (line === undefined) break;
      if (line.raw.trim() !== "" && line.indent <= parentIndent) break;
      if (line.raw.trim() !== "" && contentIndent < 0) contentIndent = line.indent;
      collected.push(line.raw.trim() === "" ? "" : line.raw.slice(Math.max(contentIndent, 0)));
      this.position += 1;
    }
    return style.startsWith(">") ? collected.join(" ").replace(/\s+/g, " ").trim() : collected.join("\n").trimEnd();
  }

  private value(rest: string, keyIndent: number, sequenceParent: boolean): YamlNode {
    const trimmed = rest.trim();
    if (/^[|>][-+]?$/.test(trimmed)) {
      return this.blockScalar(keyIndent, trimmed);
    }
    if (trimmed !== "") {
      return scalar(trimmed);
    }
    const next = this.peek();
    if (next === undefined) return "";
    if (next.indent > keyIndent) return this.block(next.indent);
    // A sequence may sit at the indent of its key.
    if (!sequenceParent && next.indent === keyIndent && next.text.startsWith("- ")) {
      return this.sequence(keyIndent);
    }
    return "";
  }

  private mapping(indent: number): YamlNode {
    const result: Record<string, YamlNode> = {};
    while (this.position < this.lines.length) {
      const line = this.peek();
      if (line === undefined || line.indent !== indent || line.text.startsWith("- ")) break;
      const colon = keyColon(line.text);
      if (colon < 0) {
        this.position += 1;
        continue;
      }
      const key = unquote(line.text.slice(0, colon));
      this.position += 1;
      result[key] = this.value(line.text.slice(colon + 1), indent, false);
    }
    return result;
  }

  private sequence(indent: number): YamlNode {
    const result: YamlNode[] = [];
    while (this.position < this.lines.length) {
      const line = this.peek();
      if (line === undefined || line.indent !== indent || !(line.text.startsWith("- ") || line.text === "-")) break;
      const itemText = line.text === "-" ? "" : line.text.slice(2);
      const itemIndent = indent + 2;
      if (itemText.trim() === "") {
        this.position += 1;
        result.push(this.block(itemIndent));
        continue;
      }
      const colon = keyColon(itemText);
      if (colon < 0 || itemText.trim().startsWith('"') || itemText.trim().startsWith("'")) {
        this.position += 1;
        result.push(scalar(itemText));
        continue;
      }
      // A mapping that starts on the line of the dash: rewrite the line as the first key.
      const rewritten: Line = { indent: itemIndent, text: itemText, raw: " ".repeat(itemIndent) + itemText };
      this.lines[this.position] = rewritten;
      result.push(this.mapping(itemIndent));
    }
    return result;
  }
}

/** Parses the block YAML of a workflow. */
export function parseYaml(text: string): YamlNode {
  const lines: Line[] = [];
  for (const raw of text.replace(/\t/g, "  ").split(/\r?\n/)) {
    const withoutComment = stripComment(raw);
    if (withoutComment.trim() === "" && raw.trim() !== "" && !raw.trim().startsWith("#")) continue;
    if (raw.trim().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    lines.push({ indent, text: withoutComment.trim(), raw: withoutComment });
  }
  return new Parser(lines).parse();
}

// ---------------------------------------------------------------------------
// Workflows.

export interface WorkflowStep {
  readonly name: string;
  readonly run: string | undefined;
  readonly uses: string | undefined;
  readonly continueOnError: string | undefined;
  /** The `if:` of the step, or undefined. */
  readonly condition: string | undefined;
}

export interface WorkflowJob {
  readonly id: string;
  readonly continueOnError: string | undefined;
  /** The `if:` of the job, or undefined. */
  readonly condition: string | undefined;
  readonly steps: readonly WorkflowStep[];
}

export interface Workflow {
  readonly file: string;
  readonly triggers: readonly string[];
  readonly jobs: readonly WorkflowJob[];
}

export const WORKFLOW_DIRECTORY = path.join(".forgejo", "workflows");

function asRecord(node: YamlNode | undefined): Readonly<Record<string, YamlNode>> {
  return node !== undefined && typeof node === "object" && !Array.isArray(node) ? node : {};
}

function asString(node: YamlNode | undefined): string | undefined {
  return typeof node === "string" ? node : undefined;
}

function triggersOf(node: YamlNode | undefined): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.filter((item): item is string => typeof item === "string");
  return Object.keys(asRecord(node));
}

/** The workflows in `.forgejo/workflows/`, or an empty list. */
export function loadWorkflows(root: string = repositoryRoot): Workflow[] {
  const directory = path.join(root, WORKFLOW_DIRECTORY);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .map((file) => {
      const document = asRecord(parseYaml(readFileSync(path.join(directory, file), "utf8")));
      const jobs = Object.entries(asRecord(document["jobs"])).map(([id, value]) => {
        const job = asRecord(value);
        const steps = Array.isArray(job["steps"]) ? job["steps"] : [];
        return {
          id,
          continueOnError: asString(job["continue-on-error"]),
          condition: asString(job["if"]),
          steps: steps.map((stepNode, index) => {
            const step = asRecord(stepNode);
            return {
              name: asString(step["name"]) ?? `step ${String(index + 1)}`,
              run: asString(step["run"]),
              uses: asString(step["uses"]),
              continueOnError: asString(step["continue-on-error"]),
              condition: asString(step["if"]),
            };
          }),
        };
      });
      return { file, triggers: triggersOf(document["on"]), jobs };
    });
}

/** The workflows that a pull request starts. */
export function pullRequestWorkflows(root: string = repositoryRoot): Workflow[] {
  return loadWorkflows(root).filter((workflow) =>
    workflow.triggers.some((trigger) => trigger === "pull_request" || trigger === "pull_request_target"),
  );
}

export interface RunCommand {
  readonly workflow: string;
  readonly job: WorkflowJob;
  readonly step: WorkflowStep;
  /** The command of the step. */
  readonly command: string;
  /**
   * The command with each `pnpm run <script>` followed by the body of that
   * script in `package.json`, so a check that a script holds is found too.
   */
  readonly expanded: string;
}

function packageScripts(root: string): Readonly<Record<string, string>> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const scripts: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "scripts") : undefined;
  const result: Record<string, string> = {};
  if (typeof scripts === "object" && scripts !== null) {
    for (const [name, body] of Object.entries(scripts)) {
      if (typeof body === "string") result[name] = body;
    }
  }
  return result;
}

const PNPM_SCRIPT = /\bpnpm\s+(?:run\s+)?([\w:.-]+)/g;

function expand(command: string, scripts: Readonly<Record<string, string>>, depth = 0): string {
  if (depth > 3) return command;
  let expanded = command;
  for (const match of command.matchAll(PNPM_SCRIPT)) {
    const body = scripts[match[1] ?? ""];
    if (body !== undefined) {
      expanded += `\n${expand(body, scripts, depth + 1)}`;
    }
  }
  return expanded;
}

/** Every `run:` command of the workflows, in file and step order. */
export function runCommands(workflows: readonly Workflow[], root: string = repositoryRoot): RunCommand[] {
  const scripts = packageScripts(root);
  const commands: RunCommand[] = [];
  for (const workflow of workflows) {
    for (const job of workflow.jobs) {
      for (const step of job.steps) {
        if (step.run !== undefined) {
          commands.push({ workflow: workflow.file, job, step, command: step.run, expanded: expand(step.run, scripts) });
        }
      }
    }
  }
  return commands;
}

/**
 * The conditions that never skip a job or a step whose earlier steps passed:
 * none, the default `success()`, `always()` and `!cancelled()`. Any other
 * condition can skip the check on a pull request, and a skipped check passes.
 */
const GATE_CONDITIONS = /^(?:\$\{\{\s*)?(?:success\(\)|always\(\)|!\s*cancelled\(\))(?:\s*\}\})?$/;

function isSoftCondition(condition: string | undefined): boolean {
  if (condition === undefined || condition.trim() === "") return false;
  return !GATE_CONDITIONS.test(condition.trim());
}

/**
 * True when a `||` of the command lets a failure through: each `||` is soft
 * unless what follows it ends the command with a failure (`exit` with a code
 * other than 0, or `false`). A `||` inside a `[[ … ]]` test is a logical or.
 */
function hasSoftOr(command: string): boolean {
  for (const line of command.split(/\r?\n/)) {
    const withoutTests = line.replace(/\[\[[^\]]*\]\]/g, "[[ ]]");
    const parts = withoutTests.split("||");
    for (const rest of parts.slice(1)) {
      const fails = /^\s*(?:\{[^}]*?;\s*)?(?:exit\s+(?:[1-9]\d*|"?\$\?"?)|false)\b/.test(rest) ||
        /^\s*\{[^}]*\bexit\s+[1-9]\d*\b[^}]*\}/.test(rest);
      if (!fails) return true;
    }
  }
  return false;
}

/** True when a failure of the step can still let the pipeline pass. */
export function isSoftGate(command: RunCommand): boolean {
  const soft = (value: string | undefined): boolean => value !== undefined && value.trim() !== "false";
  return (
    soft(command.job.continueOnError) ||
    soft(command.step.continueOnError) ||
    isSoftCondition(command.job.condition) ||
    isSoftCondition(command.step.condition) ||
    hasSoftOr(command.command) ||
    /\bset\s+\+e\b/.test(command.command)
  );
}

/** A list of the workflow files, for a failure message. */
export function describeWorkflows(): string {
  const all = loadWorkflows();
  return all.length === 0
    ? `there is no workflow in ${WORKFLOW_DIRECTORY.replace(/\\/g, "/")}/`
    : all.map((workflow) => `${workflow.file} (on: ${workflow.triggers.join(", ")})`).join("; ");
}
