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
 * - the target is not the database that `DATABASE_URL` names.
 *
 * The guard never writes a connection string. An error names the rule, the
 * database name and the host, and never the user, the password or the query.
 */

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
}

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

  const appDatabase = env["DATABASE_URL"] === undefined ? null : parseTarget(env["DATABASE_URL"]);
  if (appDatabase !== null && appDatabase.host === host && appDatabase.port === port && appDatabase.name === name) {
    throw new DatabaseGuardError(`${variable} names the database of DATABASE_URL. The suite is not run.`);
  }

  return { name, host, port };
}
