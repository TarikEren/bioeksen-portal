/**
 * The probes behind the health endpoints (FND-04 rule 2).
 *
 * Readiness gates on PostgreSQL and Redis. The object store and the mail relay
 * appear in the full report only: without them the app degrades (an upload or a
 * code mail fails) and still serves the other requests, so their failure does
 * not take an instance out of rotation.
 *
 * Each probe has its own deadline and never throws.
 */
import "server-only";

import net from "node:net";
import { statfs } from "node:fs/promises";
import os from "node:os";

import { pingCache } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { getPoolStats, pingDatabase } from "@/lib/db";

/** `ok` working, `fail` present but broken, `na` not applicable (`standard-api-endpoints.md`). */
export type CheckValue = "ok" | "fail" | "na";

const DEPENDENCY_TIMEOUT_MS = 1_500;
const BYTES_PER_GB = 1_000_000_000;

function toCheck(passed: boolean): CheckValue {
  return passed ? "ok" : "fail";
}

export async function checkDatabase(): Promise<CheckValue> {
  return toCheck(await pingDatabase());
}

export async function checkCache(): Promise<CheckValue> {
  return toCheck(await pingCache());
}

/** The object store answers an HTTP request. Any HTTP status means that it is up. */
export async function checkObjectStore(): Promise<CheckValue> {
  try {
    await fetch(getConfig().S3_ENDPOINT_URL, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(DEPENDENCY_TIMEOUT_MS),
    });
    return "ok";
  } catch {
    return "fail";
  }
}

/** The mail relay accepts a TCP connection. */
export function checkMailRelay(): Promise<CheckValue> {
  return new Promise((resolve) => {
    let host: string;
    let port: number;
    try {
      const config = getConfig();
      host = config.SMTP_HOST;
      port = config.SMTP_PORT;
    } catch {
      resolve("fail");
      return;
    }
    const socket = net.connect({ host, port });
    const finish = (value: CheckValue): void => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(DEPENDENCY_TIMEOUT_MS);
    socket.once("connect", () => {
      finish("ok");
    });
    socket.once("timeout", () => {
      finish("fail");
    });
    socket.once("error", () => {
      finish("fail");
    });
  });
}

export interface DatabaseCounts {
  readonly openConnections: number;
  readonly inUseConnections: number;
  readonly idleConnections: number;
}

/** The connection counts of the pool. All zero when the configuration is unusable. */
export function readDatabaseCounts(): DatabaseCounts {
  try {
    const stats = getPoolStats();
    return { openConnections: stats.open, inUseConnections: stats.inUse, idleConnections: stats.idle };
  } catch {
    return { openConnections: 0, inUseConnections: 0, idleConnections: 0 };
  }
}

export interface Capacity {
  readonly memory: {
    readonly totalHeap: number;
    readonly usedHeap: number;
    readonly totalMemory: number;
    readonly usedMemory: number;
  };
  readonly disk: { readonly total: number; readonly used: number; readonly free: number };
}

/** Gigabytes (decimal) with two decimals, as `standard-api-endpoints.md` gives them. */
function toGigabytes(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 100) / 100;
}

/** The memory of the process and of the host, and the disk of the working directory, in GB. */
export async function readCapacity(): Promise<Capacity> {
  const heap = process.memoryUsage();
  const disk = await statfs(process.cwd());
  const total = disk.blocks * disk.bsize;
  const free = disk.bavail * disk.bsize;
  const unallocated = disk.bfree * disk.bsize;
  return {
    memory: {
      totalHeap: toGigabytes(heap.heapTotal),
      usedHeap: toGigabytes(heap.heapUsed),
      totalMemory: toGigabytes(os.totalmem()),
      usedMemory: toGigabytes(os.totalmem() - os.freemem()),
    },
    disk: { total: toGigabytes(total), used: toGigabytes(total - unallocated), free: toGigabytes(free) },
  };
}
