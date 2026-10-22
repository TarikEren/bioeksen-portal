/**
 * The database client (DEC-005, FND-06 rule 1).
 *
 * One process-wide Prisma 8 client over `src/prisma/contract.json`. Only the
 * repositories import it (`sds-nextjs-backend` §1). `server-only` makes the
 * build fail when client code imports it.
 *
 * Skeleton of stage B0: the names and the signatures. Every body throws
 * `NotImplemented`. The client, when built, is a module-level singleton. The
 * one exception is a development cache, because `next dev` evaluates modules
 * again on each edit and would leave a pool behind each time.
 */
import "server-only";

import type postgres from "@prisma/orm-postgres/runtime";

import type { Contract } from "@/prisma/contract.d";
import { NotImplemented } from "@/lib/errors";

/** The typed client: `db.orm.public.PlatformLogRecord`, `db.sql`, `db.transaction`. */
export type Db = ReturnType<typeof postgres<Contract>>;

/** The one client of the process. It connects on the first query. */
export function getDb(): Db {
  throw new NotImplemented("getDb");
}

/** Whether the database answers a trivial query. The readiness check uses it (FND-04 rule 2). */
export function pingDatabase(): Promise<boolean> {
  throw new NotImplemented("pingDatabase");
}
