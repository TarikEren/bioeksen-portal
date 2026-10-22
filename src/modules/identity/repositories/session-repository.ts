/**
 * The sessions, in Redis (ACC-20, DEC-007, DEC-024, DEC-025).
 *
 * - `session:<SHA-256 of the session id>` is a hash with `userId`, `createdAt`
 *   and `lastSeenAt`. Redis keeps the hash of the id, never the id, so a read of
 *   Redis gives nobody a working cookie.
 * - `user-sessions:<user id>` is the set of the hashes of the live sessions of
 *   one user, so a deactivation or a password reset ends each of them
 *   (ACC-10.AC7, ACC-11.AC2).
 *
 * A session ends after 60 minutes without a request and after 12 hours in total
 * (DEC-025). The rules read the clock of the app (`now()`), so the test seam can
 * move it. The expiry of Redis is only the clean-up of the keys that nobody
 * touches: the rules above decide, not the expiry.
 */
import "server-only";

import { z } from "zod";

import { withCache } from "@/lib/cache";
import { now } from "@/lib/clock";
import { EntityId } from "@/lib/schemas/identity";

import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, hashSecret, randomSecret } from "../domain/tokens";

const SESSION_PREFIX = "session:";
const USER_SESSIONS_PREFIX = "user-sessions:";

const SessionFields = z.object({
  userId: EntityId,
  createdAt: z.coerce.number().int().positive(),
  lastSeenAt: z.coerce.number().int().positive(),
});

export interface LiveSession {
  /** The id of the user, as the text of the `bigint` key. */
  readonly userId: string;
}

const sessionKey = (hash: string): string => `${SESSION_PREFIX}${hash}`;
const userKey = (userId: string): string => `${USER_SESSIONS_PREFIX}${userId}`;

/** Opens a session. A sign-in always makes a new id (ACC-20 rule 4, AC9). */
export async function openSession(userId: string): Promise<string> {
  const sessionId = randomSecret();
  const hash = hashSecret(sessionId);
  const at = String(now().getTime());
  await withCache(async (cache) => {
    await cache
      .multi()
      .hSet(sessionKey(hash), { userId, createdAt: at, lastSeenAt: at })
      .pExpire(sessionKey(hash), SESSION_IDLE_MS)
      .sAdd(userKey(userId), hash)
      .pExpire(userKey(userId), SESSION_ABSOLUTE_MS)
      .exec();
  });
  return sessionId;
}

/**
 * The live session of an id, and a new `lastSeenAt` for it. A session that is
 * idle for 60 minutes, or 12 hours old, ends here (ACC-20.AC6, AC7).
 */
export async function touchSession(sessionId: string): Promise<LiveSession | null> {
  const hash = hashSecret(sessionId);
  return withCache(async (cache) => {
    const stored = await cache.hGetAll(sessionKey(hash));
    const parsed = SessionFields.safeParse(stored);
    if (!parsed.success) {
      return null;
    }
    const { userId, createdAt, lastSeenAt } = parsed.data;
    const at = now().getTime();
    if (at - lastSeenAt >= SESSION_IDLE_MS || at - createdAt >= SESSION_ABSOLUTE_MS) {
      await cache.multi().del(sessionKey(hash)).sRem(userKey(userId), hash).exec();
      return null;
    }
    const remaining = Math.max(1, SESSION_ABSOLUTE_MS - (at - createdAt));
    await cache
      .multi()
      .hSet(sessionKey(hash), { lastSeenAt: String(at) })
      .pExpire(sessionKey(hash), Math.min(SESSION_IDLE_MS, remaining))
      .exec();
    return { userId };
  });
}

/** Ends one session (ACC-20 rule 4). A session that has ended already is not an error. */
export async function endSession(sessionId: string): Promise<void> {
  const hash = hashSecret(sessionId);
  await withCache(async (cache) => {
    const userId = await cache.hGet(sessionKey(hash), "userId");
    const commands = cache.multi().del(sessionKey(hash));
    if (typeof userId === "string" && EntityId.safeParse(userId).success) {
      commands.sRem(userKey(userId), hash);
    }
    await commands.exec();
  });
}

/** Ends each session of a user, except the one named (ACC-10.AC7, ACC-11.AC2). */
export async function endSessionsOfUser(userId: string, exceptSessionId: string | null = null): Promise<void> {
  const keep = exceptSessionId === null ? null : hashSecret(exceptSessionId);
  await withCache(async (cache) => {
    const hashes = (await cache.sMembers(userKey(userId))).filter((hash) => hash !== keep);
    if (hashes.length === 0) {
      return;
    }
    const commands = cache.multi();
    for (const hash of hashes) {
      commands.del(sessionKey(hash));
    }
    commands.sRem(userKey(userId), hashes);
    await commands.exec();
  });
}
