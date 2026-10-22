/**
 * The health reports (FND-04 rules 1 and 2, `standard-api-endpoints.md`).
 *
 * - Liveness checks nothing: the process answers, so it is alive.
 * - Readiness gates on PostgreSQL and Redis. While the configuration is
 *   unusable it reports `fail`, because configuration does not recover by
 *   itself (`sds-config`, **When it is validated**).
 * - The full report adds the object store and the mail relay under
 *   `dependencies`, and the capacity numbers. Their failure leaves `status` at
 *   `ok`: the app degrades and still serves.
 *
 * Authorisation (the operator) is the wrapper's check, before a service runs.
 */
import "server-only";

import { getConfigState } from "@/lib/config";
import {
  type Capacity,
  type CheckValue,
  type DatabaseCounts,
  checkCache,
  checkDatabase,
  checkMailRelay,
  checkObjectStore,
  readCapacity,
  readDatabaseCounts,
} from "@/lib/health";

export type HealthStatus = "ok" | "fail";

export interface LivenessReport {
  readonly status: "ok";
}

export interface ReadinessReport {
  readonly status: HealthStatus;
  readonly uptime: number;
  readonly checks: {
    readonly db: CheckValue;
    readonly cache: CheckValue;
    /** Only the dependencies that gate traffic. None in release 1. */
    readonly dependencies: Readonly<Record<string, CheckValue>>;
  };
}

export interface HealthReport {
  readonly status: HealthStatus;
  readonly uptime: number;
  readonly checks: {
    readonly db: { readonly status: CheckValue } & DatabaseCounts;
    readonly cache: CheckValue;
    /** Every dependency, whether or not it gates traffic. */
    readonly dependencies: Readonly<Record<string, CheckValue>>;
    readonly memory: Capacity["memory"];
    readonly disk: Capacity["disk"];
  };
}

function uptimeSeconds(): number {
  return Math.floor(process.uptime());
}

/** The process is alive when it can answer. */
export function liveness(): LivenessReport {
  return { status: "ok" };
}

export async function readiness(): Promise<ReadinessReport> {
  if (getConfigState().status === "failed") {
    return { status: "fail", uptime: uptimeSeconds(), checks: { db: "fail", cache: "fail", dependencies: {} } };
  }
  const [db, cache] = await Promise.all([checkDatabase(), checkCache()]);
  return {
    status: db === "ok" && cache === "ok" ? "ok" : "fail",
    uptime: uptimeSeconds(),
    checks: { db, cache, dependencies: {} },
  };
}

export async function fullHealth(): Promise<HealthReport> {
  const [db, cache, objectStore, smtp, capacity] = await Promise.all([
    checkDatabase(),
    checkCache(),
    checkObjectStore(),
    checkMailRelay(),
    readCapacity(),
  ]);
  return {
    status: db === "ok" && cache === "ok" ? "ok" : "fail",
    uptime: uptimeSeconds(),
    checks: {
      db: { status: db, ...readDatabaseCounts() },
      cache,
      dependencies: { "object-store": objectStore, smtp },
      memory: capacity.memory,
      disk: capacity.disk,
    },
  };
}
