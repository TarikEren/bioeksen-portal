/**
 * The results-only interface of the test tiers (`sds-testing`, **What the
 * developers see**; `references/nextjs.md`, `test:results`).
 *
 *   pnpm run test:results [unit] [component] [integration] [pipeline] [e2e] [--grep <regex>]
 *
 * For each test it prints the tier, the status, the title and, for a failure,
 * the failure message. Then a summary. It prints nothing else: no test
 * source, no code frame, no stack trace and no file path. The runners' own
 * output is never shown; the results come from their JSON reports.
 *
 * Exit code: 0 when every test passed, 1 when a test failed or a test file did
 * not load, 2 when a tier with tests could not run (`NOT RUN`, with the
 * reason). A tier that could not run is never a pass.
 *
 * The end-to-end tier runs the production build: run `pnpm run build` first.
 *
 * This file runs under Node.js type stripping, so it imports only Node.js
 * modules and uses only erasable TypeScript syntax.
 */
import { spawn } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Tier = "unit" | "component" | "integration" | "pipeline" | "e2e";
type Status = "PASS" | "FAIL" | "SKIP";

interface TestOutcome {
  readonly tier: Tier;
  readonly status: Status;
  readonly title: string;
  readonly message: string;
}

interface TierReport {
  readonly tier: Tier;
  readonly outcomes: TestOutcome[];
  /** Messages of test files that did not load. */
  readonly loadFailures: string[];
  /** Set when the tier has tests and could not run. */
  readonly notRun: string | null;
}

const ALL_TIERS: readonly Tier[] = ["unit", "component", "integration", "pipeline", "e2e"];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The test files of each tier, as `vitest.config.ts` and `playwright.config.ts` match them. */
const TIER_FILES: Readonly<Record<Tier, readonly string[]>> = {
  unit: ["src/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/support/**/*.test.ts"],
  component: ["src/**/*.test.tsx", "tests/component/**/*.test.tsx"],
  integration: ["tests/integration/**/*.test.ts"],
  pipeline: ["tests/pipeline/**/*.test.ts"],
  e2e: ["tests/e2e/**/*.spec.ts"],
};

// ---------------------------------------------------------------------------
// Cleaning a message: no stack, no code frame, no path.

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const WINDOWS_PATH = /[A-Za-z]:[\\/][^\s:'"`()]+/g;
const FILE_URL = /file:\/\/\/?[^\s'"`()]+/g;
const POSIX_PATH = /(?<![\w.])\/(?:[\w.@+-]+\/)+[\w.@+-]+/g;
const RELATIVE_PATH = /(?<![\w/])(?:\.{1,2}\/)*(?:src|tests|node_modules|\.next|app)\/[^\s:'"`()]+/g;

export function cleanMessage(raw: string): string {
  const lines = raw.replace(ANSI, "").split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s+at\s/.test(line)) continue; // stack frame
    if (/^\s*>?\s*\d+\s*\|/.test(line) || /^\s*\|\s*[~^]/.test(line)) continue; // code frame
    if (/^\s*❯\s/.test(line)) continue; // vitest location line
    kept.push(
      line
        .replace(FILE_URL, "<path>")
        .replace(WINDOWS_PATH, "<path>")
        .replace(POSIX_PATH, "<path>")
        .replace(RELATIVE_PATH, "<path>")
        .replace(/<path>(?::\d+){1,2}/g, "<path>"),
    );
  }
  const text = kept.join("\n").trim();
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
}

// ---------------------------------------------------------------------------
// Running a runner.

interface RunOutcome {
  readonly code: number | null;
  readonly stderr: string;
}

async function runQuiet(args: readonly string[], env: Record<string, string>): Promise<RunOutcome> {
  return await new Promise<RunOutcome>((resolve) => {
    const child = spawn(process.execPath, [...args], {
      cwd: root,
      env: { ...process.env, ...env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ code: null, stderr: String(error) }));
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return parsed;
  } catch {
    return undefined;
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstReason(stderr: string): string {
  const meaningful = cleanMessage(stderr)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /error|refuse|not set|cannot|failed|ECONNREFUSED|not run/i.test(line));
  return meaningful.slice(0, 3).join(" | ") || "the runner ended without a report";
}

function hasTests(tier: Tier): boolean {
  return TIER_FILES[tier].some((pattern) => globSync(pattern, { cwd: root }).length > 0);
}

async function runVitest(tier: Exclude<Tier, "e2e">, grep: string | undefined, workDir: string): Promise<TierReport> {
  const report = path.join(workDir, `${tier}.json`);
  const args = [
    path.join(root, "node_modules", "vitest", "vitest.mjs"),
    "run",
    "--project",
    tier,
    "--reporter=json",
    `--outputFile=${report}`,
  ];
  if (grep !== undefined) args.push("--testNamePattern", grep);
  const run = await runQuiet(args, {});
  const json = readJson(report);
  const outcomes: TestOutcome[] = [];
  const loadFailures: string[] = [];
  for (const file of list(field(json, "testResults"))) {
    const assertions = list(field(file, "assertionResults"));
    for (const assertion of assertions) {
      const status = text(field(assertion, "status"));
      outcomes.push({
        tier,
        status: status === "passed" ? "PASS" : status === "failed" ? "FAIL" : "SKIP",
        title: text(field(assertion, "title")),
        message: status === "failed" ? cleanMessage(list(field(assertion, "failureMessages")).map(text).join("\n")) : "",
      });
    }
    const fileMessage = text(field(file, "message"));
    if (assertions.length === 0 && text(field(file, "status")) === "failed") {
      loadFailures.push(cleanMessage(fileMessage) || "a test file did not load");
    }
  }
  const ran = outcomes.length > 0 || loadFailures.length > 0;
  const noMatch = grep !== undefined && run.code === 0;
  const notRun = !ran && !noMatch && run.code !== 0 ? firstReason(run.stderr) : null;
  return { tier, outcomes, loadFailures, notRun };
}

function playwrightSpecs(suite: unknown, into: unknown[]): void {
  for (const spec of list(field(suite, "specs"))) into.push(spec);
  for (const child of list(field(suite, "suites"))) playwrightSpecs(child, into);
}

async function runPlaywright(grep: string | undefined, workDir: string): Promise<TierReport> {
  const report = path.join(workDir, "e2e.json");
  const args = [path.join(root, "node_modules", "@playwright", "test", "cli.js"), "test", "--reporter=json"];
  if (grep !== undefined) args.push("--grep", grep);
  const run = await runQuiet(args, { PLAYWRIGHT_JSON_OUTPUT_NAME: report, PLAYWRIGHT_JSON_OUTPUT_FILE: report });
  const json = readJson(report);
  const specs: unknown[] = [];
  for (const suite of list(field(json, "suites"))) playwrightSpecs(suite, specs);
  const outcomes: TestOutcome[] = [];
  for (const spec of specs) {
    for (const entry of list(field(spec, "tests"))) {
      const results = list(field(entry, "results"));
      const last = results[results.length - 1];
      const status = text(field(entry, "status"));
      const messages = list(field(last, "errors")).map((error) => text(field(error, "message")));
      outcomes.push({
        tier: "e2e",
        status: status === "expected" ? "PASS" : status === "skipped" ? "SKIP" : "FAIL",
        title: text(field(spec, "title")),
        message: status === "expected" || status === "skipped" ? "" : cleanMessage(messages.join("\n")),
      });
    }
  }
  const globalErrors = list(field(json, "errors")).map((error) => cleanMessage(text(field(error, "message"))));
  const executed = outcomes.some((outcome) => outcome.status !== "SKIP");
  let notRun: string | null = null;
  if (globalErrors.length > 0 && !executed) {
    notRun = globalErrors.slice(0, 3).join(" | ");
  } else if (json === undefined && run.code !== 0) {
    notRun = firstReason(run.stderr);
  }
  return { tier: "e2e", outcomes, loadFailures: executed ? globalErrors : [], notRun };
}

// ---------------------------------------------------------------------------
// The command line.

function isTier(value: string): value is Tier {
  return ALL_TIERS.some((tier) => tier === value);
}

function parseArguments(argv: readonly string[]): { tiers: Tier[]; grep: string | undefined } {
  const tiers: Tier[] = [];
  let grep: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--grep" || argument === "-g") {
      grep = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--grep=")) {
      grep = argument.slice("--grep=".length);
    } else if (isTier(argument)) {
      tiers.push(argument);
    } else if (argument !== "--") {
      process.stdout.write(`Unknown argument "${argument}". Tiers: ${ALL_TIERS.join(", ")}; option: --grep <regex>\n`);
      process.exit(2);
    }
  }
  return { tiers: tiers.length === 0 ? [...ALL_TIERS] : ALL_TIERS.filter((tier) => tiers.includes(tier)), grep };
}

async function main(): Promise<void> {
  const { tiers, grep } = parseArguments(process.argv.slice(2));
  const workDir = mkdtempSync(path.join(os.tmpdir(), "bioeksen-portal-results-"));
  const reports: TierReport[] = [];
  try {
    for (const tier of tiers) {
      if (!hasTests(tier)) continue;
      const report = tier === "e2e" ? await runPlaywright(grep, workDir) : await runVitest(tier, grep, workDir);
      reports.push(report);
      if (report.notRun !== null) {
        process.stdout.write(`NOT RUN [${tier}] ${report.notRun}\n`);
      }
      for (const failure of report.loadFailures) {
        process.stdout.write(`FAIL  [${tier}] a test file did not load\n${indent(failure)}\n`);
      }
      for (const outcome of report.outcomes) {
        // With --grep, the tests that do not match are skipped: not shown.
        if (grep !== undefined && outcome.status === "SKIP") continue;
        process.stdout.write(`${outcome.status}  [${tier}] ${outcome.title}\n`);
        if (outcome.status === "FAIL" && outcome.message !== "") {
          process.stdout.write(`${indent(outcome.message)}\n`);
        }
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const outcomes = reports.flatMap((report) => report.outcomes);
  const count = (status: Status): number => outcomes.filter((outcome) => outcome.status === status).length;
  const loadFailures = reports.reduce((sum, report) => sum + report.loadFailures.length, 0);
  const notRun = reports.filter((report) => report.notRun !== null).map((report) => report.tier);
  process.stdout.write(
    `\n${String(count("PASS"))} passed, ${String(count("FAIL"))} failed, ${String(count("SKIP"))} skipped` +
      `${loadFailures > 0 ? `, ${String(loadFailures)} file(s) did not load` : ""}` +
      `${notRun.length > 0 ? `; NOT RUN: ${notRun.join(", ")}` : ""}\n`,
  );
  process.exitCode = notRun.length > 0 ? 2 : count("FAIL") > 0 || loadFailures > 0 ? 1 : 0;
}

function indent(message: string): string {
  return message
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

await main();
