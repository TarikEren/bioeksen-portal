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
 * The full report takes the operator that the route authenticated.
 */
import "server-only";

import { type OperatorPrincipal, requireOperator } from "@/lib/auth";
import { getConfigState } from "@/lib/config";
import type { ErrorCode } from "@/lib/errors";
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
import { logger } from "@/lib/logging";

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

/**
 * The last state of each gating dependency that a probe saw. A change is logged
 * once, not at every probe (`sds-logging`, **What to log**: dependency status
 * transitions).
 */
const lastSeen = new Map<string, CheckValue>();

const UNAVAILABLE_CODES: Readonly<Record<"db" | "cache", ErrorCode>> = { db: "DB-5500", cache: "CACHE-5500" };

function recordTransition(dependency: "db" | "cache", value: CheckValue): void {
  const previous = lastSeen.get(dependency);
  lastSeen.set(dependency, value);
  if (previous === value || (previous === undefined && value === "ok")) {
    return;
  }
  if (value === "fail") {
    logger.failure(UNAVAILABLE_CODES[dependency], { tail: { dependency } });
  } else if (value === "ok") {
    logger.write({ severity: "INFO", type: "APP", message: "dependency recovered", tail: { dependency } });
  }
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
  recordTransition("db", db);
  recordTransition("cache", cache);
  return {
    status: db === "ok" && cache === "ok" ? "ok" : "fail",
    uptime: uptimeSeconds(),
    checks: { db, cache, dependencies: {} },
  };
}

/**
 * The full report: capacity numbers and every dependency. It takes the operator
 * who asks, so no caller without the check can read it.
 */
export async function fullHealth(principal: OperatorPrincipal): Promise<HealthReport> {
  requireOperator(principal);
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
