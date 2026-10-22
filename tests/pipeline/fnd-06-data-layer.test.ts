/**
 * FND-06 Data layer: AC1 (the drift check) and AC2 (the guard of the
 * integration suite).
 *
 * AC1 changes the contract in a copy of the repository and runs
 * `pnpm run db:check` there. If the drift check needs a database, it gets the
 * disposable integration database (`TEST_DATABASE_URL`, checked by the guard),
 * never another one.
 *
 * AC2 runs the integration suite of the repository against a database whose
 * name does not end in `_integration`, and proves that the suite refuses to
 * run and creates nothing.
 */
import { spawn } from "node:child_process";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDisposableDatabase } from "../support/db-guard";
import { repositoryRoot } from "../support/paths";
import { type RepositoryCopy, type RunResult, copyRepository, tail } from "../support/repo-copy";

const CONTRACT = "src/prisma/contract.prisma";

/** A model that no migration creates. */
const DRIFT_MODEL = [
  "",
  "model QaDriftFixture {",
  "  id BigInt @id @default(autoincrement())",
  '  @@map("qa_drift_fixture")',
  "}",
  "",
].join("\n");

function integrationDatabaseUrl(): string {
  const connectionString = process.env["TEST_DATABASE_URL"];
  assertDisposableDatabase(connectionString, "TEST_DATABASE_URL", { tier: "integration" });
  if (connectionString === undefined) {
    throw new Error("TEST_DATABASE_URL is not set.");
  }
  return connectionString;
}

describe("FND-06 drift check", () => {
  let copy: RepositoryCopy;
  let original: string;
  let env: Record<string, string>;

  beforeAll(() => {
    copy = copyRepository({ linkNodeModules: true });
    original = copy.read(CONTRACT);
    env = { DATABASE_URL: integrationDatabaseUrl() };
  });

  afterAll(() => {
    copy.remove();
  });

  async function dbCheck(): Promise<RunResult> {
    return await copy.pnpm(["run", "db:check"], { env });
  }

  /** The drift check passes when the contract and the migrations agree. */
  it("FND-06.AC1: the drift check passes when the contract and the migrations agree", async () => {
    copy.write(CONTRACT, original);
    const result = await dbCheck();

    expect(result.code, tail(result)).toBe(0);
  });

  /** The drift check fails when the emitted contract has a model that no migration creates. */
  it("FND-06.AC1: the drift check fails when the emitted contract has a model that no migration creates", async () => {
    copy.write(CONTRACT, original);
    const control = await dbCheck();
    expect(control.code, `precondition: the drift check passes on the unchanged copy\n${tail(control)}`).toBe(0);

    copy.write(CONTRACT, original + DRIFT_MODEL);
    const emitted = await copy.pnpm(["run", "contract:emit"], { env });
    expect(emitted.code, `precondition: the changed contract emits\n${tail(emitted)}`).toBe(0);
    const result = await dbCheck();

    expect(result.code, tail(result)).not.toBe(0);
  });

  /** The drift check fails when contract.prisma changed and nobody emitted or planned a migration. */
  it("FND-06.AC1: the drift check fails when contract.prisma has a model that no migration creates", async () => {
    copy.write(CONTRACT, original);
    await copy.pnpm(["run", "contract:emit"], { env });
    const control = await dbCheck();
    expect(control.code, `precondition: the drift check passes on the unchanged copy\n${tail(control)}`).toBe(0);

    copy.write(CONTRACT, original + DRIFT_MODEL);
    const result = await dbCheck();

    expect(result.code, tail(result)).not.toBe(0);
  });
});

describe("FND-06 integration database guard", () => {
  /** An integration database whose name does not end in _integration: the suite refuses to run and creates nothing. */
  it("FND-06.AC2: the integration suite refuses a database whose name does not end in _integration, and creates nothing", async () => {
    const valid = new URL(integrationDatabaseUrl());
    const probeName = `bioeksen_portal_qa_guard_probe_${String(process.pid)}`;
    const probe = new URL(valid.toString());
    probe.pathname = `/${probeName}`;

    const maintenance = new URL(valid.toString());
    maintenance.pathname = "/postgres";
    maintenance.search = "";
    const exists = async (): Promise<boolean> => {
      const client = new Client({ connectionString: maintenance.toString() });
      await client.connect();
      try {
        const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [probeName]);
        return result.rowCount === 1;
      } finally {
        await client.end();
      }
    };
    expect(await exists(), "precondition: the probe database does not exist").toBe(false);

    const result = await runIntegrationSuite(probe.toString());

    expect(result.code, tail(result)).not.toBe(0);
    expect(result.output, "the refusal names the rule").toMatch(/_integration/);
    expect(await exists(), "the suite created no database").toBe(false);
  });
});

/** Runs `pnpm run test:integration` in the repository with another integration database. */
async function runIntegrationSuite(databaseUrl: string): Promise<RunResult> {
  const execPath = process.env["npm_execpath"];
  const viaNode = execPath !== undefined && /pnpm/i.test(execPath) && /\.(c?js|mjs)$/.test(execPath);
  const env: NodeJS.ProcessEnv = { ...process.env, TEST_DATABASE_URL: databaseUrl };
  for (const name of Object.keys(env)) {
    if (name.startsWith("VITEST") || name === "DATABASE_URL") delete env[name];
  }

  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(
      viaNode ? process.execPath : "pnpm",
      viaNode ? [execPath ?? "", "run", "test:integration"] : ["run", "test:integration"],
      { cwd: repositoryRoot, env, shell: !viaNode && process.platform === "win32", windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr, output: `${stdout}\n${stderr}` }));
  });
}
