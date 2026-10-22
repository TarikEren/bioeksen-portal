/**
 * The guard of the disposable databases (FND-06 rule 4, `sds-testing`,
 * **Test databases**).
 *
 * A suite that creates, migrates or empties a database calls this guard first.
 * The guard refuses a target unless all of these are true:
 * - the name ends in `_integration` or `_e2e` (the suffix of the tier, when the
 *   caller names the tier);
 * - the name is a plain identifier of at most 63 bytes (a longer name is
 *   refused, not cut, because two cut names can collide);
 * - the host is in `TEST_DATABASE_HOSTS`, or is a loopback host when the
 *   variable is not set;
 * - the target is not the database that `DATABASE_URL` names, in the
 *   environment or in a `.env` file of the repository that Next.js or the
 *   Prisma CLI loads. `localhost`, `127.0.0.1` and `::1` are one host for this
 *   comparison. A `DATABASE_URL` that the guard cannot read makes it refuse.
 *
 * The guard never writes a connection string. An error names the rule, the
 * database name and the host, and never the user, the password or the query.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./paths";

export type DisposableTier = "integration" | "e2e";

export const DISPOSABLE_SUFFIXES: Readonly<Record<DisposableTier, string>> = {
  integration: "_integration",
  e2e: "_e2e",
};

export const MAX_DATABASE_NAME_BYTES = 63;

const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "::1"];

export class DatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseGuardError";
  }
}

export interface GuardOptions {
  /** The tier of the suite. It fixes the suffix. Default: either suffix. */
  readonly tier?: DisposableTier;
  /** The environment to read `TEST_DATABASE_HOSTS` and `DATABASE_URL` from. Default: `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** The `.env` files to read `DATABASE_URL` from. Default: `ENV_FILES` in the repository root. */
  readonly envFiles?: readonly string[];
}

/** The `.env` files that Next.js (`@next/env`) or the Prisma CLI (`dotenv`) can load. */
export const ENV_FILES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
  ".env.production",
  ".env.production.local",
];

/** A target that the guard accepted. */
export interface DisposableDatabase {
  readonly name: string;
  readonly host: string;
  readonly port: number;
}

interface ParsedTarget extends DisposableDatabase {
  readonly url: URL;
}

function parseTarget(connectionString: string): ParsedTarget | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let name: string;
  try {
    name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
  const port = url.port === "" ? 5432 : Number(url.port);
  return { name, host, port, url };
}

/** One name for the loopback host, so that two spellings of it compare equal. */
function comparableHost(host: string): string {
  return LOOPBACK_HOSTS.includes(host) ? "loopback" : host;
}

/** The value of `DATABASE_URL` in a `.env` file, or undefined. The value is never written anywhere. */
function databaseUrlInFile(file: string): string | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  let found: string | undefined;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/.exec(raw);
    if (match === null) {
      continue;
    }
    let value = (match[1] ?? "").trim();
    const quoted = /^(["'`])(.*)\1$/.exec(value);
    if (quoted !== null) {
      value = quoted[2] ?? "";
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    found = value;
  }
  return found;
}

function allowedHosts(env: Readonly<Record<string, string | undefined>>): readonly string[] {
  const configured = env["TEST_DATABASE_HOSTS"];
  if (configured === undefined || configured.trim() === "") {
    return LOOPBACK_HOSTS;
  }
  return configured
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== "");
}

/**
 * Accepts a disposable database or refuses it.
 *
 * @param connectionString The connection string of the target, `undefined` when the variable is not set.
 * @param variable The name of the variable that held it, for the error.
 * @throws DatabaseGuardError when any rule of the guard fails.
 */
export function assertDisposableDatabase(
  connectionString: string | undefined,
  variable: string,
  options: GuardOptions = {},
): DisposableDatabase {
  const env = options.env ?? process.env;

  if (connectionString === undefined || connectionString.trim() === "") {
    throw new DatabaseGuardError(`${variable} is not set. The suite is not run.`);
  }
  const target = parseTarget(connectionString.trim());
  if (target === null) {
    throw new DatabaseGuardError(`${variable} is not a PostgreSQL connection string. The suite is not run.`);
  }
  const { name, host, port, url } = target;

  // The host and hostaddr parameters replace the host of the URL, and the
  // guard would check a host that the driver does not use.
  if (url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    throw new DatabaseGuardError(`${variable} sets the host in its query. The suite is not run.`);
  }

  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new DatabaseGuardError(
      `The database name "${name}" in ${variable} is not a plain lowercase identifier. The suite is not run.`,
    );
  }
  if (Buffer.byteLength(name, "utf8") > MAX_DATABASE_NAME_BYTES) {
    throw new DatabaseGuardError(
      `The database name "${name}" in ${variable} is longer than ${MAX_DATABASE_NAME_BYTES} bytes. The suite is not run.`,
    );
  }

  const suffixes =
    options.tier === undefined ? Object.values(DISPOSABLE_SUFFIXES) : [DISPOSABLE_SUFFIXES[options.tier]];
  if (!suffixes.some((suffix) => name.endsWith(suffix) && name.length > suffix.length)) {
    throw new DatabaseGuardError(
      `The database name "${name}" in ${variable} does not end in ${suffixes.join(" or ")}. The suite is not run.`,
    );
  }

  if (!allowedHosts(env).includes(host)) {
    throw new DatabaseGuardError(
      `The host "${host}" in ${variable} is not in TEST_DATABASE_HOSTS. The suite is not run.`,
    );
  }

  const files = (options.envFiles ?? ENV_FILES.map((file) => path.join(repositoryRoot, file))).filter(
    (file) => path.basename(file) !== ".env.example",
  );
  const appDatabases: ReadonlyArray<readonly [string, string | undefined]> = [
    ["DATABASE_URL", env["DATABASE_URL"]],
    ...files.map((file) => [`DATABASE_URL in ${path.basename(file)}`, databaseUrlInFile(file)] as const),
  ];
  for (const [source, value] of appDatabases) {
    if (value === undefined || value.trim() === "") {
      continue;
    }
    const appDatabase = parseTarget(value.trim());
    if (appDatabase === null) {
      throw new DatabaseGuardError(`The guard cannot read ${source}, so it cannot compare it. The suite is not run.`);
    }
    if (
      comparableHost(appDatabase.host) === comparableHost(host) &&
      appDatabase.port === port &&
      appDatabase.name === name
    ) {
      throw new DatabaseGuardError(`${variable} names the database of ${source}. The suite is not run.`);
    }
  }

  return { name, host, port };
}
