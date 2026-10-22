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
 * Nothing here writes a connection string. The child process gets it only in
 * `DATABASE_URL`, never in its arguments. Its output is cleaned of the
 * connection string and of the password, encoded and decoded, before an error
 * carries it.
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

/** The forms of a connection string's secrets that a tool can print. */
function secretsOf(connectionString: string): string[] {
  const secrets = [connectionString];
  let url: URL | undefined;
  try {
    url = new URL(connectionString);
  } catch {
    return secrets;
  }
  // The URL holds the password percent-encoded; a tool may print it encoded or decoded.
  secrets.push(url.password);
  try {
    secrets.push(decodeURIComponent(url.password));
  } catch {
    // A password that does not decode has only its encoded form.
  }
  return secrets;
}

/**
 * Removes the connection string and its password, encoded and decoded, from
 * a text. The longest secret goes first, so the whole URL goes before the
 * password inside it.
 */
export function redactConnection(text: string, connectionString: string): string {
  return [...new Set(secretsOf(connectionString))]
    .filter((secret) => secret !== "")
    .sort((a, b) => b.length - a.length)
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
  // The connection string goes only through DATABASE_URL, which the config of
  // the CLI reads (prisma.config.ts). An argument would show in the process list.
  const result = spawnSync(process.execPath, [binary, "db", "migrate", "--no-interactive"], {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: connectionString },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = redactConnection(`${result.stdout}\n${result.stderr}`, connectionString);
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
