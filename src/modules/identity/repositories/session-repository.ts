/**
 * The sessions (ACC-20, DEC-024, DEC-025). Stage B1 step 4 moves them to Redis.
 * This file holds the form that the services use: they never see where the
 * sessions are.
 */
import "server-only";

import { now } from "@/lib/clock";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, hashSecret, randomSecret } from "../domain/tokens";

interface SessionRecord {
  readonly userId: string;
  readonly createdAt: Date;
  lastSeenAt: Date;
}

export interface LiveSession {
  readonly userId: string;
}

// MOCK: ACC-20 (the memory store goes in the next commit of stage B1 step 4)
const sessions = new Map<string, SessionRecord>();

export function openSession(userId: string): Promise<string> {
  const sessionId = randomSecret();
  const at = now();
  sessions.set(hashSecret(sessionId), { userId, createdAt: at, lastSeenAt: at });
  return Promise.resolve(sessionId);
}

export function touchSession(sessionId: string): Promise<LiveSession | null> {
  const key = hashSecret(sessionId);
  const session = sessions.get(key);
  if (session === undefined) {
    return Promise.resolve(null);
  }
  const at = now();
  if (at.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_MS || at.getTime() - session.createdAt.getTime() >= SESSION_ABSOLUTE_MS) {
    sessions.delete(key);
    return Promise.resolve(null);
  }
  session.lastSeenAt = at;
  return Promise.resolve({ userId: session.userId });
}

export function endSession(sessionId: string): Promise<void> {
  sessions.delete(hashSecret(sessionId));
  return Promise.resolve();
}

export function endSessionsOfUser(userId: string, exceptSessionId: string | null = null): Promise<void> {
  const keep = exceptSessionId === null ? null : hashSecret(exceptSessionId);
  for (const [key, session] of sessions) {
    if (session.userId === userId && key !== keep) {
      sessions.delete(key);
    }
  }
  return Promise.resolve();
}
