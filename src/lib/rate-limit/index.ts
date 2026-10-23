/**
 * The rate limits of the app (DEC-007, DEC-027, FND-04 rule 4, `sds-auth`,
 * **Rate limiting**). The counters are in Redis, so every instance of the app
 * sees the same count.
 *
 * Two forms:
 *
 * - The failures of an attempt with a credential: a sliding window of failures
 *   for one source, and optionally a lock for the failures in a row of one
 *   subject (an email address). `reserveAttempt` counts the attempt as a failure
 *   before the credential is checked, in one atomic step, so attempts at the
 *   same time cannot all pass the limits while the count is low (R-053). It
 *   refuses a source with `limit` failures in the last `windowMs`, and a locked
 *   subject, also when its credential is right. The attempt that reaches the
 *   threshold locks the subject for `lockMs`. A right credential gives the
 *   attempt back and ends the failures in a row (`releaseSucceededAttempt`). An
 *   attempt that reached no decision counts nothing (`cancelAttempt`).
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

export interface ConsecutiveLimit {
  /** The failures in a row that lock the subject. */
  readonly threshold: number;
  readonly lockMs: number;
}

/** The limits of one attempt with a credential. */
export interface AttemptLimits {
  /** The window of failures of the source. */
  readonly source: { readonly scope: string; readonly subject: string; readonly limit: WindowLimit };
  /** The lock after failures in a row of a subject, when the attempt names one. */
  readonly lock?: { readonly scope: string; readonly subject: string; readonly limit: ConsecutiveLimit };
}

/** An attempt that `reserveAttempt` counted as a failure. */
export interface AttemptReservation {
  readonly windowKey: string;
  readonly member: string;
  readonly lockKey: string | null;
  /** The end of the lock that this attempt set, or `null` when it set none. */
  readonly lockedUntil: string | null;
}

/**
 * The reservation of an attempt, in one atomic step. `KEYS[1]` is the window of
 * the source, and `KEYS[2]`, when it is there, the lock of the subject.
 * `ARGV` holds the time of the app in milliseconds, the member, the limit and
 * the length of the window, the threshold, the end of a lock that this attempt
 * sets, and the expiry of the lock key.
 *
 * It returns `{1, ms}` when the source has `limit` failures in the window,
 * `{2, ms}` when the subject is locked, with the milliseconds until the attempt
 * may come again, and counts nothing. Otherwise it counts the attempt in the
 * window and in the failures in a row, and returns `{0, 1}` when the attempt
 * locked the subject, else `{0, 0}`. A lock that has ended is removed first, so
 * the failures count from zero again (ACC-20.AC4).
 */
const RESERVE_SCRIPT = `
local at = tonumber(ARGV[1])
local limit = tonumber(ARGV[3])
local window = tonumber(ARGV[4])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", at - window)
local count = redis.call("ZCARD", KEYS[1])
if count >= limit then
  local blocking = redis.call("ZRANGE", KEYS[1], count - limit, count - limit, "WITHSCORES")
  return {1, tonumber(blocking[2]) + window - at}
end
local locked = 0
if #KEYS == 2 then
  local lockedUntil = tonumber(redis.call("HGET", KEYS[2], "lockedUntil"))
  if lockedUntil ~= nil and lockedUntil > at then
    return {2, lockedUntil - at}
  end
  if lockedUntil ~= nil then
    redis.call("DEL", KEYS[2])
  end
  if redis.call("HINCRBY", KEYS[2], "failures", 1) >= tonumber(ARGV[5]) then
    redis.call("HSET", KEYS[2], "lockedUntil", ARGV[6])
    locked = 1
  end
  redis.call("PEXPIRE", KEYS[2], tonumber(ARGV[7]))
end
redis.call("ZADD", KEYS[1], at, ARGV[2])
redis.call("PEXPIRE", KEYS[1], window * 2)
return {0, locked}
`;

/**
 * Gives an attempt back after a right credential: it leaves the window, and the
 * failures in a row of the subject end. `KEYS` are as for `RESERVE_SCRIPT`, and
 * `ARGV[1]` is the member.
 */
const RELEASE_SCRIPT = `
redis.call("ZREM", KEYS[1], ARGV[1])
if #KEYS == 2 then
  redis.call("DEL", KEYS[2])
end
return 0
`;

/**
 * Removes an attempt that reached no decision: it leaves the window, and the
 * failures in a row lose the one that it added. A lock that it set ends.
 * `KEYS` are as for `RESERVE_SCRIPT`, `ARGV[1]` is the member, and `ARGV[2]`
 * the end of the lock that the attempt set, or an empty string.
 */
const CANCEL_SCRIPT = `
redis.call("ZREM", KEYS[1], ARGV[1])
if #KEYS == 2 and redis.call("HEXISTS", KEYS[2], "failures") == 1 then
  if redis.call("HINCRBY", KEYS[2], "failures", -1) <= 0 then
    redis.call("HDEL", KEYS[2], "failures")
  end
  if ARGV[2] ~= "" and redis.call("HGET", KEYS[2], "lockedUntil") == ARGV[2] then
    redis.call("HDEL", KEYS[2], "lockedUntil")
  end
end
return 0
`;

function keysOf(reservation: AttemptReservation): string[] {
  return reservation.lockKey === null ? [reservation.windowKey] : [reservation.windowKey, reservation.lockKey];
}

/**
 * Counts an attempt as a failure before its credential is checked (DEC-027,
 * FND-04 rule 4). The check and the count are one atomic step, so attempts at
 * the same time get one place each, and an attempt over a limit counts nothing.
 *
 * @throws RateLimitedError 429 `RATE-4400` when the source has `limit` failures in the window, with the time until the oldest one that blocks leaves it; or when the subject is locked, with the time until the lock ends.
 */
export async function reserveAttempt(limits: AttemptLimits): Promise<AttemptReservation> {
  const at = now().getTime();
  const { source, lock } = limits;
  const windowKey = keyOf(WINDOW_PREFIX, source.scope, source.subject);
  const lockKey = lock === undefined ? null : keyOf(LOCK_PREFIX, lock.scope, lock.subject);
  // The member is unique, so two attempts in one millisecond are two members.
  const member = `${at}-${Math.random().toString(36).slice(2)}`;
  const lockEnd = lock === undefined ? "" : String(at + lock.limit.lockMs);
  const reply = await withCache((cache) =>
    cache.eval(RESERVE_SCRIPT, {
      keys: lockKey === null ? [windowKey] : [windowKey, lockKey],
      arguments: [
        String(at),
        member,
        String(source.limit.limit),
        String(source.limit.windowMs),
        String(lock?.limit.threshold ?? 0),
        lockEnd,
        String(COUNTER_TTL_MS),
      ],
    }),
  );
  const [state, value] = Array.isArray(reply) ? reply.map(Number) : [Number.NaN, Number.NaN];
  if (state === 1) {
    throw new RateLimitedError(value / 1000, "the source has too many failures in the window");
  }
  if (state === 2) {
    throw new RateLimitedError(value / 1000, "the subject is locked after consecutive failures");
  }
  return { windowKey, member, lockKey, lockedUntil: value === 1 ? lockEnd : null };
}

/** Gives the attempt back after a right credential, and ends the failures in a row of the subject. */
export async function releaseSucceededAttempt(reservation: AttemptReservation): Promise<void> {
  await withCache((cache) => cache.eval(RELEASE_SCRIPT, { keys: keysOf(reservation), arguments: [reservation.member] }));
}

/** Removes an attempt that reached no decision, for example because the database failed. It counts nothing then. */
export async function cancelAttempt(reservation: AttemptReservation): Promise<void> {
  await withCache((cache) =>
    cache.eval(CANCEL_SCRIPT, { keys: keysOf(reservation), arguments: [reservation.member, reservation.lockedUntil ?? ""] }),
  );
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
