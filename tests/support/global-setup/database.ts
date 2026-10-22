/**
 * Recreates a disposable database and applies the migrations to it (FND-06
 * rules 2 and 4, `sds-testing` **Test databases**).
 *
 * The guard runs first. Nothing is dropped or created when the guard refuses.
 * The steps are: connect to the maintenance database `postgres` of the same
 * server, drop the database, create it empty, and run `prisma db migrate`
 * against it. The migrations apply in the order of the on-disk graph, as they
 * apply in every other environment.
 *
 * Nothing here writes a connection string. The output of the child process is
 * cleaned of the connection string and the password before an error carries it.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import { Client } from "pg";

import { type DisposableDatabase, type DisposableTier, assertDisposableDatabase } from "../db-guard";
// Playwright loads this file as CommonJS, where import.meta does not exist.
import { repositoryRoot } from "../paths";

/** The variable that holds the connection string of each tier. */
export const TIER_VARIABLES: Readonly<Record<DisposableTier, string>> = {
  integration: "TEST_DATABASE_URL",
  e2e: "TEST_E2E_DATABASE_URL",
};

function redact(text: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret !== "")
    .reduce((result, secret) => result.split(secret).join("<redacted>"), text);
}

function maintenanceUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  url.search = "";
  return url.toString();
}

async function recreateDatabase(connectionString: string, name: string): Promise<void> {
  const client = new Client({ connectionString: maintenanceUrl(connectionString) });
  await client.connect();
  try {
    // The guard allowed only [a-z0-9_]+ for the name, so quoting is safe.
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

function applyMigrations(connectionString: string): void {
  const require = createRequire(path.join(repositoryRoot, "package.json"));
  const binary = path.join(path.dirname(require.resolve("prisma/package.json")), "dist", "prisma.js");
  const result = spawnSync(process.execPath, [binary, "db", "migrate", "--db", connectionString, "--no-interactive"], {
    cwd: repositoryRoot,
    // The config of the CLI reads DATABASE_URL. It must name the disposable database.
    env: { ...process.env, DATABASE_URL: connectionString },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const secrets = [connectionString, new URL(connectionString).password];
    const output = redact(`${result.stdout}\n${result.stderr}`, secrets);
    throw new Error(`prisma db migrate failed with exit code ${String(result.status)}.\n${output}`);
  }
}

/**
 * Prepares the disposable database of a tier.
 *
 * @throws DatabaseGuardError when the guard refuses the target. Nothing changes then.
 */
export async function prepareDisposableDatabase(
  tier: DisposableTier,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DisposableDatabase> {
  const variable = TIER_VARIABLES[tier];
  const connectionString = env[variable];
  const database = assertDisposableDatabase(connectionString, variable, { tier, env });
  if (connectionString === undefined) {
    throw new Error(`${variable} is not set.`);
  }
  await recreateDatabase(connectionString, database.name);
  applyMigrations(connectionString);
  return database;
}
