/**
 * The database client (DEC-005, FND-06 rule 1).
 *
 * One process-wide Prisma 8 client over `src/prisma/contract.json`, on one
 * `pg.Pool` that this module owns, so the full health report can read the pool
 * counts. Only the repositories import it (`sds-nextjs-backend` §1).
 * `server-only` makes the build fail when client code imports it.
 *
 * The client is a module-level singleton. The one exception is a development
 * cache, because `next dev` evaluates modules again on each edit and would
 * leave a pool behind each time.
 */
import "server-only";

import postgres from "@prisma/orm-postgres/runtime";
import { Pool } from "pg";

import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import contractJson from "@/prisma/contract.json" with { type: "json" };
import type { Contract } from "@/prisma/contract.d";

/** The typed client: `db.orm.public.PlatformLogRecord`, `db.sql`, `db.transaction`. */
export type Db = ReturnType<typeof postgres<Contract>>;

/** The seconds to wait for a connection, and for the answer of a probe. */
const CONNECTION_TIMEOUT_MS = 2_000;
const PROBE_TIMEOUT_MS = 3_000;

export interface PoolStats {
  readonly open: number;
  readonly inUse: number;
  readonly idle: number;
}

interface DatabaseHandle {
  readonly pool: Pool;
  readonly db: Db;
}

/** The development cache of the handle. Production never reads it. */
const developmentCache = globalThis as typeof globalThis & { __bioeksenDatabase?: DatabaseHandle };

let handle: DatabaseHandle | undefined;

function createHandle(): DatabaseHandle {
  const pool = new Pool({
    connectionString: getConfig().DATABASE_URL,
    max: POOL_SIZE,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
    query_timeout: 30_000,
    allowExitOnIdle: true,
  });
  // An idle client that loses its connection emits `error`. Without a listener
  // the process would end.
  pool.on("error", () => undefined);
  return { pool, db: postgres<Contract>({ contractJson, pg: pool }) };
}

function getHandle(): DatabaseHandle {
  if (handle !== undefined) {
    return handle;
  }
  const cached = developmentCache.__bioeksenDatabase;
  if (cached !== undefined) {
    handle = cached;
    return handle;
  }
  handle = createHandle();
  if (getConfig().APP_ENV === "development") {
    developmentCache.__bioeksenDatabase = handle;
  }
  return handle;
}

/**
 * The one client of the process. It connects on the first query.
 *
 * @throws ConfigError when the configuration is not usable.
 */
export function getDb(): Db {
  return getHandle().db;
}

/** The connection counts of the pool. All zero before the first query. */
export function getPoolStats(): PoolStats {
  const { pool } = getHandle();
  return { open: pool.totalCount, inUse: pool.totalCount - pool.idleCount, idle: pool.idleCount };
}

/** Whether the database answers a trivial query. The readiness check uses it (FND-04 rule 2). */
export async function pingDatabase(): Promise<boolean> {
  try {
    const { pool } = getHandle();
    const answer = await Promise.race([
      pool.query("SELECT 1 AS ok"),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("probe timed out")), PROBE_TIMEOUT_MS).unref();
      }),
    ]);
    return answer.rowCount === 1;
  } catch {
    return false;
  }
}

const POOL_SIZE = 10;

/** Whether every pooled connection is in use. */
function isPoolExhausted(): boolean {
  if (handle === undefined) {
    return false;
  }
  const { pool } = handle;
  return pool.totalCount >= POOL_SIZE && pool.idleCount === 0;
}

const UNREACHABLE_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
]);

/** The codes and the messages in the chain of causes of an error. */
function* walk(error: unknown): Generator<{ code: string | undefined; message: string }> {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    const code = Reflect.get(current, "code");
    yield { code: typeof code === "string" ? code : undefined, message: current.message };
    current = current.cause;
  }
}

/**
 * Maps a failure of the driver to the error of the registry, per the **Database
 * failures** table of `code-prefixes.md`. A raw driver error never reaches a
 * caller. The text of the driver goes to the log record, redacted by the logger.
 */
export function toDatabaseError(error: unknown, operation: "read" | "write" | "delete"): AppError {
  if (error instanceof AppError) {
    return error;
  }
  for (const { code, message } of walk(error)) {
    if (code !== undefined) {
      if (UNREACHABLE_CODES.has(code) || code.startsWith("08") || code.startsWith("57P")) {
        return new AppError("DB-5500", "Database unavailable", { cause: error });
      }
      if (code === "23505") {
        return new AppError("RES-4300", "Resource already exists", { cause: error });
      }
      if (code === "23503") {
        // A foreign key: a write names a record that does not exist (a field value),
        // or a delete is refused because other rows still reference the row.
        return operation === "delete"
          ? new AppError("RES-4302", "Operation not allowed in current state", { cause: error })
          : new AppError("VAL-4006", "Field value invalid", { cause: error });
      }
      if (code === "23001") {
        // `restrict_violation`: platform_refuse_delete() refuses the delete of a controlled record (DEC-010).
        return new AppError("RES-4302", "Operation not allowed in current state", { cause: error });
      }
      if (code === "40001") {
        return new AppError("RES-4301", "Conflicting concurrent update", { cause: error });
      }
      if (code.startsWith("40")) {
        // Any other transaction rollback, a deadlock for one.
        return new AppError("DB-5002", "Transaction rolled back", { cause: error });
      }
      if (code.startsWith("23")) {
        return new AppError("DB-5001", "Write failed", { cause: error });
      }
    }
    if (/timeout exceeded when trying to connect/i.test(message)) {
      return isPoolExhausted()
        ? new AppError("DB-5501", "Connection pool exhausted", { cause: error })
        : new AppError("DB-5500", "Database unavailable", { cause: error });
    }
    if (/connection terminated|connection refused|CONNECTION_FAILED/i.test(message)) {
      return new AppError("DB-5500", "Database unavailable", { cause: error });
    }
  }
  return operation === "read"
    ? new AppError("DB-5000", "Query failed", { cause: error })
    : new AppError("DB-5001", "Write failed", { cause: error });
}
