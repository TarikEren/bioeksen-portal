/**
 * The check of the toolchain (FND-01 rule 1, DEC-003): `pnpm run toolchain:check`.
 *
 * It proves that the tools in use are the tools the repository names:
 *
 * - the major version of Node.js is the one of `.nvmrc`;
 * - the version of pnpm is the one of `packageManager` in `package.json`.
 *
 * Exit codes: 0 both match; 1 one does not; 2 the check could not read a file.
 *
 * This file is a script of the repository, not part of the app, so it reads
 * `process.env` itself.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");

function cannotRun(message: string): never {
  console.error(`toolchain:check could not run: ${message}`);
  process.exit(2);
}

/** The major version of `.nvmrc`: `24`, `v24`, `24.1.0` and `v24.1.0` all give 24. */
function readNvmrcMajor(): number {
  let text: string;
  try {
    text = readFileSync(path.join(root, ".nvmrc"), "utf8").trim();
  } catch {
    return cannotRun(".nvmrc is not readable.");
  }
  const match = /^v?(\d+)(?:\.\d+){0,2}$/.exec(text);
  if (match?.[1] === undefined) {
    return cannotRun(`.nvmrc holds "${text}". It must be a version number such as 24.`);
  }
  return Number(match[1]);
}

/** The version of pnpm in `packageManager`: `pnpm@12.11.2` and `pnpm@12.11.2+sha512.…` give 12.11.2. */
function readPackageManagerVersion(): string {
  let field: unknown;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    field = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "packageManager") : undefined;
  } catch {
    return cannotRun("package.json is not readable.");
  }
  const match = typeof field === "string" ? /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(field) : null;
  if (match?.[1] === undefined) {
    return cannotRun('package.json has no "packageManager" field of the form pnpm@<version>.');
  }
  return match[1];
}

/** The version of the pnpm that runs this script: from the user agent that pnpm sets, else from `pnpm --version`. */
function readPnpmVersion(): string | null {
  const agent = /^pnpm\/(\d+\.\d+\.\d+)/.exec(process.env["npm_config_user_agent"] ?? "");
  if (agent?.[1] !== undefined) {
    return agent[1];
  }
  const result = spawnSync("pnpm", ["--version"], { encoding: "utf8", shell: true });
  const version = result.status === 0 ? /^(\d+\.\d+\.\d+)/.exec(result.stdout.trim())?.[1] : undefined;
  return version ?? null;
}

const expectedNodeMajor = readNvmrcMajor();
const expectedPnpm = readPackageManagerVersion();
const actualNodeMajor = Number(process.versions.node.split(".")[0]);
const actualPnpm = readPnpmVersion();

const problems: string[] = [];
if (actualNodeMajor !== expectedNodeMajor) {
  problems.push(`Node.js ${process.versions.node} is running, and .nvmrc names the major version ${String(expectedNodeMajor)}.`);
}
if (actualPnpm === null) {
  problems.push("pnpm is not found.");
} else if (actualPnpm !== expectedPnpm) {
  problems.push(`pnpm ${actualPnpm} is running, and packageManager names pnpm ${expectedPnpm}.`);
}

if (problems.length > 0) {
  console.error(`toolchain:check failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log(`toolchain:check ok: Node.js ${process.versions.node}, pnpm ${expectedPnpm}`);
