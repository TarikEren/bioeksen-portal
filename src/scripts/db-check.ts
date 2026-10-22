/**
 * The drift check of the data layer (FND-06 rule 3, DEC-005):
 * `pnpm run db:check`.
 *
 * It proves that the Prisma contract, the generated files and the migrations
 * agree:
 *
 * 1. `prisma contract emit` regenerates `contract.json` and `contract.d.ts`.
 *    They must not change: a change means the contract was edited and the
 *    generated files were not committed with it.
 * 2. `prisma migration check` verifies the migration files and their graph.
 * 3. The migrations apply to a fresh, empty, disposable database, and the schema
 *    that results satisfies the contract (`prisma db migrate`, then
 *    `prisma db verify`). A contract that no migration reaches fails here.
 *
 * The database is `TEST_DATABASE_URL`, and nothing else: `DATABASE_URL` is the
 * database of the app's own configuration, and the check drops its target
 * (`sds-testing`, **Test databases**). The guard of FND-06 rule 4 applies before
 * anything is created or dropped: the name ends in `_integration`, the host is
 * in `TEST_DATABASE_HOSTS` (default: the loopback address), and the database is
 * not the one of `DATABASE_URL`. A connection string is never printed.
 *
 * The check does not change the working tree. If the emit changes a generated
 * file, the script writes the old text back and fails.
 *
 * Exit codes: 0 the three checks passed; 1 a check failed; 2 the check could not
 * run (no database, or the guard refused it).
 *
 * This file is a script of the repository, not part of the app, so it reads
 * `process.env` itself.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

const root = path.resolve(import.meta.dirname, "..", "..");
const generatedFiles = ["src/prisma/contract.json", "src/prisma/contract.d.ts"];
const requireFromRoot = createRequire(path.join(root, "package.json"));

const SUFFIX = "_integration";
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export interface DatabaseTarget {
  readonly url: string;
  readonly name: string;
  readonly host: string;
}

export class CheckFailure extends Error {
  readonly exitCode: 1 | 2;

  constructor(message: string, exitCode: 1 | 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

export type Environment = Readonly<Record<string, string | undefined>>;

/** The disposable database, after the guard of FND-06 rule 4. Only `TEST_DATABASE_URL` names it. */
export function resolveTarget(env: Environment): DatabaseTarget {
  const raw = env["TEST_DATABASE_URL"];
  if (raw === undefined || raw === "") {
    throw new CheckFailure(
      "db:check could not run: TEST_DATABASE_URL is not set (a database whose name ends in _integration).",
      2,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CheckFailure("db:check could not run: TEST_DATABASE_URL is not a connection string.", 2);
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name.endsWith(SUFFIX) || !/^[a-z0-9_]+$/.test(name)) {
    throw new CheckFailure(`db:check refused the database: its name must be lowercase letters, digits and underscores, and end in ${SUFFIX}.`, 2);
  }
  const allowedHosts = (env["TEST_DATABASE_HOSTS"] ?? LOOPBACK_HOSTS.join(","))
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host !== "");
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new CheckFailure("db:check refused the database: its host is not in TEST_DATABASE_HOSTS.", 2);
  }
  const development = env["DATABASE_URL"];
  if (development !== undefined && development !== "") {
    try {
      const other = new URL(development);
      const sameServer = other.hostname === parsed.hostname && (other.port || "5432") === (parsed.port || "5432");
      if (sameServer && decodeURIComponent(other.pathname.replace(/^\//, "")) === name) {
        throw new CheckFailure("db:check refused the database: it is the database of DATABASE_URL.", 2);
      }
    } catch (error) {
      if (error instanceof CheckFailure) {
        throw error;
      }
    }
  }
  return { url: raw, name, host: parsed.hostname };
}

/** Writes back the text that a generated file had before the emit, for each file that changed. @returns the changed files. */
export function restoreChanged(rootDirectory: string, files: readonly string[], before: readonly string[]): string[] {
  const changed: string[] = [];
  files.forEach((file, index) => {
    const previous = before[index];
    const location = path.join(rootDirectory, file);
    if (previous !== undefined && readFileSync(location, "utf8") !== previous) {
      writeFileSync(location, previous);
      changed.push(file);
    }
  });
  return changed;
}

/** Removes the connection string and the password from the text of a child process. */
function redact(text: string, target: DatabaseTarget | undefined): string {
  if (target === undefined) {
    return text;
  }
  const password = decodeURIComponent(new URL(target.url).password);
  let result = text.split(target.url).join("[connection string]");
  if (password !== "") {
    result = result.split(password).join("[password]");
  }
  return result;
}

/** Runs the Prisma CLI of the repository. The database url goes in the environment, never in the arguments. */
function prisma(args: readonly string[], target?: DatabaseTarget): { ok: boolean; output: string } {
  const packageJson = requireFromRoot.resolve("prisma/package.json");
  const binary = path.join(path.dirname(packageJson), "dist", "prisma.js");
  const result = spawnSync(process.execPath, ["--no-warnings", binary, ...args], {
    cwd: root,
    encoding: "utf8",
    env: target === undefined ? process.env : { ...process.env, DATABASE_URL: target.url },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = redact(`${result.stdout}${result.stderr}`, target);
  return { ok: result.status === 0, output };
}

/** The message of a finding, from the last line of the JSON result of the CLI. */
function summarize(output: string): string {
  const lines = output.split("\n").filter((line) => line.startsWith('{"kind":"result"'));
  const last = lines.at(-1);
  if (last === undefined) {
    return output.trim().split("\n").slice(-5).join("\n");
  }
  try {
    const parsed: unknown = JSON.parse(last);
    return JSON.stringify(parsed, null, 1).slice(0, 4000);
  } catch {
    return last.slice(0, 4000);
  }
}

function readGenerated(): string[] {
  return generatedFiles.map((file) => readFileSync(path.join(root, file), "utf8"));
}

/** Drops and creates the disposable database. The name passed the guard: lowercase letters, digits, underscores. */
async function recreateDatabase(target: DatabaseTarget): Promise<void> {
  const maintenance = new URL(target.url);
  maintenance.pathname = "/postgres";
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${target.name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${target.name}"`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const target = resolveTarget(process.env);
  console.log(`db:check on the disposable database ${target.name}`);

  // 1. The generated files do not change when the contract is emitted again.
  const before = readGenerated();
  const emitted = prisma(["contract", "emit"]);
  // A check does not change the tree: the old text goes back, so a second run fails too.
  const changed = restoreChanged(root, generatedFiles, before);
  if (!emitted.ok) {
    throw new CheckFailure(`db:check failed: prisma contract emit failed.\n${summarize(emitted.output)}`, 1);
  }
  if (changed.length > 0) {
    throw new CheckFailure(
      `db:check failed: the contract and the generated files disagree. Emitting the contract changes ${changed.join(", ")}.\nRun pnpm run contract:emit and commit the generated files with the contract.`,
      1,
    );
  }
  console.log("ok: the generated files match the contract");

  // 2. The migration files and their graph are intact.
  const checked = prisma(["migration", "check"]);
  if (!checked.ok) {
    throw new CheckFailure(`db:check failed: prisma migration check failed.\n${summarize(checked.output)}`, 1);
  }
  console.log("ok: the migrations are intact");

  // 3. The migrations reach the contract from an empty database.
  try {
    await recreateDatabase(target);
  } catch (error) {
    const reason = error instanceof Error ? redact(error.message, target) : "unknown error";
    throw new CheckFailure(`db:check could not run: the disposable database was not created (${reason}).`, 2);
  }
  const migrated = prisma(["db", "migrate"], target);
  if (!migrated.ok) {
    throw new CheckFailure(
      `db:check failed: the migrations do not reach the contract on an empty database.\n${summarize(migrated.output)}`,
      1,
    );
  }
  const verified = prisma(["db", "verify"], target);
  if (!verified.ok) {
    throw new CheckFailure(`db:check failed: the schema does not satisfy the contract.\n${summarize(verified.output)}`, 1);
  }
  console.log("ok: the migrations apply to an empty database and the schema satisfies the contract");
}

// Run only as a script. A test imports the functions above.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    if (error instanceof CheckFailure) {
      console.error(error.message);
      process.exit(error.exitCode);
    }
    console.error("db:check could not run: an unexpected error stopped it.");
    process.exit(2);
  });
}
