/**
 * The cache client (DEC-007): one Redis 7 connection for the process.
 *
 * B0 uses it for the readiness probe only. Sessions and rate-limit counters
 * come with later stages. The client never queues a command while it is
 * offline, so a probe on a dead Redis fails at once.
 */
import "server-only";

import { createClient } from "redis";

import { getConfig } from "@/lib/config";

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

let client: ReturnType<typeof newClient> | undefined;

function getClient(): ReturnType<typeof newClient> {
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
