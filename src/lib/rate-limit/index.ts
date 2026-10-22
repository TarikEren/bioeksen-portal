/**
 * The rate limits of the app (DEC-007, DEC-027, FND-04 rule 4, `sds-auth`,
 * **Rate limiting**). The counters are in Redis, so every instance of the app
 * sees the same count.
 *
 * Two forms:
 *
 * - A sliding window of failures for one source: `assertBelowLimit` refuses a
 *   caller that has `limit` failures in the last `windowMs`, and `recordFailure`
 *   adds one. The window is a sorted set of the times of the failures.
 * - A lock for consecutive failures of one subject (an email address):
 *   `recordConsecutiveFailure` counts the failures in a row, and the failure that
 *   reaches the threshold locks the subject for `lockMs`. `assertNotLocked`
 *   refuses a locked subject, also when its next try is right. A success ends the
 *   count (`clearConsecutiveFailures`).
 *
 * A refusal is 429 `RATE-4400` with the whole seconds until the caller may try
 * again (`RateLimitedError`). The rules read the clock of the app (`now()`), so
 * the test seam can move it. A subject is stored as its SHA-256, so Redis holds
 * no email address.
 */
import "server-only";

import { createHash } from "node:crypto";

import { withCache } from "@/lib/cache";
import { now } from "@/lib/clock";
import { RateLimitedError } from "@/lib/errors";

const WINDOW_PREFIX = "rate:window:";
const LOCK_PREFIX = "rate:lock:";

/** The failures of a subject in a row are forgotten after a day without a failure. */
const COUNTER_TTL_MS = 24 * 60 * 60 * 1000;

function keyOf(prefix: string, scope: string, subject: string): string {
  return `${prefix}${scope}:${createHash("sha256").update(subject).digest("hex")}`;
}

export interface WindowLimit {
  /** The most failures that a subject may have in the window. */
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Refuses a subject that has `limit` failures in the window.
 *
 * @throws RateLimitedError 429 `RATE-4400`, with the time until the oldest failure leaves the window.
 */
export async function assertBelowLimit(scope: string, subject: string, window: WindowLimit): Promise<void> {
  const key = keyOf(WINDOW_PREFIX, scope, subject);
  const at = now().getTime();
  const oldestInWindow = await withCache(async (cache) => {
    await cache.zRemRangeByScore(key, 0, at - window.windowMs);
    const count = await cache.zCard(key);
    if (count < window.limit) {
      return null;
    }
    // The failure that makes room is the one at the position `count - limit`.
    const [blocking] = await cache.zRangeWithScores(key, count - window.limit, count - window.limit);
    return blocking?.score ?? at;
  });
  if (oldestInWindow !== null) {
    throw new RateLimitedError((oldestInWindow + window.windowMs - at) / 1000, "the source has too many failures in the window");
  }
}

/** Adds one failure of a subject to its window. */
export async function recordFailure(scope: string, subject: string, window: WindowLimit): Promise<void> {
  const key = keyOf(WINDOW_PREFIX, scope, subject);
  const at = now().getTime();
  await withCache(async (cache) => {
    // The member is unique, so two failures in one millisecond are two members.
    await cache
      .multi()
      .zAdd(key, { score: at, value: `${at}-${Math.random().toString(36).slice(2)}` })
      .pExpire(key, window.windowMs * 2)
      .exec();
  });
}

/**
 * Refuses a subject that is locked.
 *
 * @throws RateLimitedError 429 `RATE-4400`, with the time until the lock ends.
 */
export async function assertNotLocked(scope: string, subject: string): Promise<void> {
  const key = keyOf(LOCK_PREFIX, scope, subject);
  const at = now().getTime();
  const lockedUntil = await withCache(async (cache) => {
    const stored = Number(await cache.hGet(key, "lockedUntil"));
    if (Number.isFinite(stored) && stored > at) {
      return stored;
    }
    if (Number.isFinite(stored) && stored > 0) {
      // The lock has ended: the next failures count from zero (ACC-20.AC4).
      await cache.del(key);
    }
    return null;
  });
  if (lockedUntil !== null) {
    throw new RateLimitedError((lockedUntil - at) / 1000, "the subject is locked after consecutive failures");
  }
}

export interface ConsecutiveLimit {
  /** The failures in a row that lock the subject. */
  readonly threshold: number;
  readonly lockMs: number;
}

/** Counts one more failure in a row. The failure that reaches the threshold locks the subject. */
export async function recordConsecutiveFailure(scope: string, subject: string, limit: ConsecutiveLimit): Promise<void> {
  const key = keyOf(LOCK_PREFIX, scope, subject);
  const at = now().getTime();
  await withCache(async (cache) => {
    const failures = await cache.hIncrBy(key, "failures", 1);
    if (failures >= limit.threshold) {
      await cache.hSet(key, { lockedUntil: String(at + limit.lockMs) });
    }
    await cache.pExpire(key, COUNTER_TTL_MS);
  });
}

/** Ends the count of failures in a row. A right password calls it. */
export async function clearConsecutiveFailures(scope: string, subject: string): Promise<void> {
  await withCache(async (cache) => {
    await cache.del(keyOf(LOCK_PREFIX, scope, subject));
  });
}
