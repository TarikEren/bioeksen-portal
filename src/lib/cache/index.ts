/**
 * The cache client (DEC-007): one Redis 7 connection for the process.
 *
 * Redis holds the sessions and the rate-limit counters (DEC-007). The client
 * never queues a command while it is offline, so a command on a dead Redis
 * fails at once: `withCache` waits a short time for the connection and then
 * gives `CACHE-5500`.
 */
import "server-only";

import { createClient } from "redis";

import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const CONNECT_WAIT_MS = 1_500;
const PROBE_TIMEOUT_MS = 2_000;

function newClient(url: string) {
  return createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: PROBE_TIMEOUT_MS,
      reconnectStrategy: (attempts: number) => Math.min(attempts * 250, 3_000),
    },
  });
}

/** The client that `withCache` hands to an operation. */
export type CacheClient = ReturnType<typeof newClient>;

let client: CacheClient | undefined;

function getClient(): CacheClient {
  if (client !== undefined) {
    return client;
  }
  const created = newClient(getConfig().REDIS_URL);
  // The client emits `error` on every failed attempt. The probe reads
  // `isReady`, so the event carries nothing the app needs.
  created.on("error", () => undefined);
  created.connect().catch(() => undefined);
  created.unref();
  client = created;
  return created;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds).unref();
  });
}

/** Whether Redis answers `PING`. */
export async function pingCache(): Promise<boolean> {
  try {
    const current = getClient();
    const deadline = Date.now() + CONNECT_WAIT_MS;
    while (!current.isReady && Date.now() < deadline) {
      await delay(50);
    }
    if (!current.isReady) {
      return false;
    }
    const answer = await Promise.race([current.ping(), delay(PROBE_TIMEOUT_MS).then(() => null)]);
    return answer === "PONG";
  } catch {
    return false;
  }
}

/** The messages of the client for a connection that is not there. */
const CONNECTION_FAILURE = /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|Socket closed|connection|not ready|client is closed/i;

/**
 * Runs an operation on the cache client. The failure of the cache is an
 * `AppError` of the registry: `CACHE-5500` when the cache is not reachable, and
 * `CACHE-5000` when it answered and the operation failed. A raw error of the
 * client never reaches a caller.
 *
 * @throws AppError `CACHE-5000`, `CACHE-5500`, or the error that the operation threw.
 */
export async function withCache<TResult>(operation: (cache: CacheClient) => Promise<TResult>): Promise<TResult> {
  const current = getClient();
  const deadline = Date.now() + CONNECT_WAIT_MS;
  while (!current.isReady && Date.now() < deadline) {
    await delay(50);
  }
  if (!current.isReady) {
    throw new AppError("CACHE-5500", "Cache unavailable", { reason: "the cache connection is not ready" });
  }
  try {
    return await operation(current);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    const text = error instanceof Error ? error.message : "";
    throw error instanceof Error && CONNECTION_FAILURE.test(text)
      ? new AppError("CACHE-5500", "Cache unavailable", { cause: error })
      : new AppError("CACHE-5000", "Cache operation failed", { cause: error });
  }
}
