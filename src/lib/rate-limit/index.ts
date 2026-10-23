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
 * - A quota of requests in a sliding window: `assertUnderQuotas` refuses a
 *   request when one of its quotas is used, and `consumeQuotas` counts the
 *   request in all of its quotas. Each quota is a sorted set of the times of the
 *   requests. One Lua script checks every quota of the request and adds to all
 *   of them, or to none, so two requests at the same time cannot both take the
 *   last place. The public lookup uses it (DEC-072, IFU-50 rule 8): a request
 *   that fails its checks counts nothing, so the service reads first, checks the
 *   request, and counts after. A refused request counts nothing.
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
// Not `rate:quota:`: the fixed windows before kept counters there, not sorted sets.
const QUOTA_PREFIX = "rate:requests:";

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

export interface QuotaLimit {
  /** The name of the counter. */
  readonly scope: string;
  /** The most requests of a subject in the window. The next request is refused. */
  readonly limit: number;
  /** The length of the window. It ends now and slides with the clock of the app. */
  readonly windowMs: number;
}

/** One quota of a request, and the subject that it counts. */
export interface QuotaCount {
  readonly quota: QuotaLimit;
  readonly subject: string;
}

/**
 * The check and the count of the quotas of one request, in one atomic step.
 * `KEYS` are the sorted sets. `ARGV[1]` is the time of the app in milliseconds,
 * `ARGV[2]` the member of the request, and `ARGV[3]` is `1` to count the request.
 * `ARGV[2 + 2i]` and `ARGV[3 + 2i]` are the limit and the window of `KEYS[i]`.
 *
 * The script removes the requests that left each window. When a quota is used,
 * it returns the milliseconds until the request that blocks leaves its window,
 * and counts nothing. Otherwise it returns 0, and counts the request in every
 * quota when `ARGV[3]` is `1`. All the keys are on one Redis (DEC-007), so one
 * script can touch them all.
 */
const QUOTA_SCRIPT = `
local at = tonumber(ARGV[1])
local wait = 0
for i, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[2 + 2 * i])
  local window = tonumber(ARGV[3 + 2 * i])
  redis.call("ZREMRANGEBYSCORE", key, "-inf", at - window)
  local count = redis.call("ZCARD", key)
  if count >= limit then
    local blocking = redis.call("ZRANGE", key, count - limit, count - limit, "WITHSCORES")
    local left = tonumber(blocking[2]) + window - at
    if left > wait then
      wait = left
    end
  end
end
if wait > 0 or ARGV[3] ~= "1" then
  return wait
end
for i, key in ipairs(KEYS) do
  redis.call("ZADD", key, at, ARGV[2])
  redis.call("PEXPIRE", key, tonumber(ARGV[3 + 2 * i]) * 2)
end
return 0
`;

/** Runs the quota script at `now()`. It returns the milliseconds until the request may come again, or 0. */
async function runQuotaScript(counts: readonly QuotaCount[], count: boolean): Promise<number> {
  const at = now().getTime();
  // The member is unique, so two requests in one millisecond are two members.
  const member = `${at}-${Math.random().toString(36).slice(2)}`;
  const reply = await withCache((cache) =>
    cache.eval(QUOTA_SCRIPT, {
      keys: counts.map(({ quota, subject }) => keyOf(QUOTA_PREFIX, quota.scope, subject)),
      arguments: [
        String(at),
        member,
        count ? "1" : "0",
        ...counts.flatMap(({ quota }) => [String(quota.limit), String(quota.windowMs)]),
      ],
    }),
  );
  return Number(reply);
}

/**
 * Refuses a request when one of its quotas is used. It counts nothing.
 *
 * @throws RateLimitedError 429 `RATE-4400`, with the time until the request may come again.
 */
export async function assertUnderQuotas(counts: readonly QuotaCount[]): Promise<void> {
  const waitMs = await runQuotaScript(counts, false);
  if (waitMs > 0) {
    throw new RateLimitedError(waitMs / 1000, "the subject used its quota in the window");
  }
}

/**
 * Counts one request in each of its quotas, and refuses it when one of them is
 * used. The check and the count are one atomic step, so the quotas hold under
 * any concurrency, and a refused request counts in no quota.
 *
 * @throws RateLimitedError 429 `RATE-4400`, with the time until the request may come again.
 */
export async function consumeQuotas(counts: readonly QuotaCount[]): Promise<void> {
  const waitMs = await runQuotaScript(counts, true);
  if (waitMs > 0) {
    throw new RateLimitedError(waitMs / 1000, "the subject used its quota in the window");
  }
}
