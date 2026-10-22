/**
 * The mock data of the identity module (stage B1, step 2 of `crisis_mode.md`).
 *
 * It holds three users, their role assignments, and the stores that stage B1
 * step 4 moves to the database and to Redis: the sessions, the invitation and
 * reset tokens, the audit rows, the mail and the files. Each function carries a
 * `MOCK:` comment with its item. Step 4 deletes this file and the comments.
 *
 * Every mock sign-in accepts the password `mock-password-1234`. These users
 * can sign in:
 *
 * | Id | Email | Role |
 * |---|---|---|
 * | 1 | `admin@mock.bioeksen.test` | Platform Administrator |
 * | 2 | `ifu.manager@mock.bioeksen.test` | IFU Manager |
 * | 3 | `inactive@mock.bioeksen.test` | none; the account is inactive |
 *
 * Four fixed tokens help the frontend to walk the flows without a mail relay:
 * `mock-invitation-token` opens the invitation of the newest user who has no
 * password, `mock-reset-token` resets the password of user 2,
 * `mock-used-token` is a used link (401 `AUTH-4101`) and `mock-expired-token` is
 * an old link (401 `AUTH-4102`).
 *
 * The state is a module-level singleton that also lives on `globalThis`, because
 * a route handler, a server action and a page can load this module as separate
 * instances in `next dev`. Only mock code does this.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { now } from "@/lib/clock";
import type { Language } from "@/lib/i18n/languages";
import type { RoleCode } from "@/lib/schemas/identity";

// MOCK: ACC-20
export const MOCK_PASSWORD = "mock-password-1234";

/** DEC-025: a session ends after 60 minutes without a request, and after 12 hours in total. */
export const SESSION_IDLE_MS = 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

/** DEC-123: an invitation link works for 14 days, a reset link for 1 hour. */
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface MockUser {
  readonly id: string;
  readonly email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: Language;
  isActive: boolean;
  /** `false` until the person opens the invitation. */
  hasPassword: boolean;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface MockRoleAssignment {
  readonly id: string;
  readonly userId: string;
  readonly roleCode: RoleCode;
  isActive: boolean;
  readonly grantedByUserId: string | null;
  readonly grantedAt: Date;
  revokedByUserId: string | null;
  revokedAt: Date | null;
}

export interface MockSession {
  readonly userId: string;
  readonly createdAt: Date;
  lastSeenAt: Date;
}

export type MockTokenPurpose = "INVITATION" | "PASSWORD_RESET";

export interface MockToken {
  readonly userId: string;
  readonly purpose: MockTokenPurpose;
  readonly expiresAt: Date;
  usedAt: Date | null;
  endedAt: Date | null;
}

export interface MockAuditRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorType: "USER" | "SYSTEM";
  readonly actorUserId: string | null;
  readonly actionCode: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly stateBefore: unknown;
  readonly stateAfter: unknown;
  readonly reason: string | null;
  readonly requestId: string | null;
}

export interface MockMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly sentAt: Date;
}

export interface MockIdentityState {
  readonly users: Map<string, MockUser>;
  readonly assignments: MockRoleAssignment[];
  /** Keyed by the SHA-256 of the session id (the plan: Redis key from the hash). */
  readonly sessions: Map<string, MockSession>;
  /** Keyed by the SHA-256 of the token. */
  readonly tokens: Map<string, MockToken>;
  readonly audit: MockAuditRow[];
  readonly outbox: MockMail[];
  readonly files: Map<string, Uint8Array>;
  nextUserId: number;
  nextAssignmentId: number;
  nextAuditId: number;
}

const STATE_KEY = Symbol.for("bioeksen.mock.identity");

function seed(): MockIdentityState {
  const created = new Date("2026-10-01T08:00:00.000Z");
  const user = (id: string, email: string, firstName: string, lastName: string, isActive: boolean): MockUser => ({
    id,
    email,
    firstName,
    lastName,
    preferredLanguage: "tr",
    isActive,
    hasPassword: true,
    createdAt: created,
    updatedAt: created,
  });
  const assignment = (id: string, userId: string, roleCode: RoleCode): MockRoleAssignment => ({
    id,
    userId,
    roleCode,
    isActive: true,
    grantedByUserId: null,
    grantedAt: created,
    revokedByUserId: null,
    revokedAt: null,
  });
  return {
    users: new Map([
      ["1", user("1", "admin@mock.bioeksen.test", "Ayşe", "Yılmaz", true)],
      ["2", user("2", "ifu.manager@mock.bioeksen.test", "Mehmet", "Kaya", true)],
      ["3", user("3", "inactive@mock.bioeksen.test", "Zeynep", "Demir", false)],
    ]),
    assignments: [assignment("1", "1", "PLATFORM_ADMINISTRATOR"), assignment("2", "2", "IFU_MANAGER")],
    sessions: new Map(),
    tokens: new Map(),
    audit: [],
    outbox: [],
    files: new Map(),
    nextUserId: 4,
    nextAssignmentId: 3,
    nextAuditId: 1,
  };
}

/** The shared state of the mock. */
// MOCK: ACC-10
export function identityMock(): MockIdentityState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: MockIdentityState };
  holder[STATE_KEY] ??= seed();
  return holder[STATE_KEY];
}

/** The SHA-256 of a secret, as hex. The stores keep this value and never the secret (ACC-10 rule 2). */
// MOCK: ACC-20
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** A random 256-bit value as base64url: a session id or a token. */
// MOCK: ACC-20
export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------- sessions

/** Opens a session. A sign-in always makes a new id (ACC-20 rule 4, AC9). */
// MOCK: ACC-20
export function openMockSession(userId: string): string {
  const sessionId = randomSecret();
  const at = now();
  identityMock().sessions.set(hashSecret(sessionId), { userId, createdAt: at, lastSeenAt: at });
  return sessionId;
}

/**
 * The live session of an id, and a new `lastSeenAt` for it. A session that is
 * idle for 60 minutes, or 12 hours old, ends here (ACC-20.AC6, AC7).
 */
// MOCK: ACC-20
export function touchMockSession(sessionId: string): MockSession | null {
  const { sessions } = identityMock();
  const key = hashSecret(sessionId);
  const session = sessions.get(key);
  if (session === undefined) {
    return null;
  }
  const at = now();
  if (at.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_MS || at.getTime() - session.createdAt.getTime() >= SESSION_ABSOLUTE_MS) {
    sessions.delete(key);
    return null;
  }
  session.lastSeenAt = at;
  return session;
}

/** Ends one session (ACC-20 rule 4). */
// MOCK: ACC-20
export function endMockSession(sessionId: string): void {
  identityMock().sessions.delete(hashSecret(sessionId));
}

/** Ends each session of a user, except the one named (ACC-10.AC7, ACC-11.AC2). */
// MOCK: ACC-10
export function endMockSessionsOfUser(userId: string, exceptSessionId: string | null = null): void {
  const { sessions } = identityMock();
  const keep = exceptSessionId === null ? null : hashSecret(exceptSessionId);
  for (const [key, session] of sessions) {
    if (session.userId === userId && key !== keep) {
      sessions.delete(key);
    }
  }
}

// ------------------------------------------------------------------ tokens

/**
 * Issues a token and ends the earlier unused token of the same user and
 * purpose (ACC-10.AC6, DEC-123).
 *
 * @returns The token in clear text. Only its hash stays in the store.
 */
// MOCK: ACC-10
export function issueMockToken(userId: string, purpose: MockTokenPurpose): string {
  const { tokens } = identityMock();
  const at = now();
  for (const token of tokens.values()) {
    if (token.userId === userId && token.purpose === purpose && token.usedAt === null && token.endedAt === null) {
      token.endedAt = at;
    }
  }
  const secret = randomSecret();
  const ttl = purpose === "INVITATION" ? INVITATION_TTL_MS : PASSWORD_RESET_TTL_MS;
  tokens.set(hashSecret(secret), { userId, purpose, expiresAt: new Date(at.getTime() + ttl), usedAt: null, endedAt: null });
  return secret;
}

/** The newest user who has no password, or `null`. */
function newestUserWithoutPassword(): MockUser | null {
  let newest: MockUser | null = null;
  for (const user of identityMock().users.values()) {
    if (!user.hasPassword && (newest === null || Number(user.id) > Number(newest.id))) {
      newest = user;
    }
  }
  return newest;
}

/** The record of a token. The four fixed tokens of the file header resolve here too. */
// MOCK: ACC-10
export function findMockToken(secret: string, purpose: MockTokenPurpose): MockToken | null {
  const at = now();
  const hour = 60 * 60 * 1000;
  switch (secret) {
    case "mock-invitation-token": {
      const pending = purpose === "INVITATION" ? newestUserWithoutPassword() : null;
      return pending === null
        ? null
        : { userId: pending.id, purpose, expiresAt: new Date(at.getTime() + hour), usedAt: null, endedAt: null };
    }
    case "mock-reset-token":
      return purpose === "PASSWORD_RESET"
        ? { userId: "2", purpose, expiresAt: new Date(at.getTime() + hour), usedAt: null, endedAt: null }
        : null;
    case "mock-used-token":
      return { userId: "2", purpose, expiresAt: new Date(at.getTime() + hour), usedAt: at, endedAt: null };
    case "mock-expired-token":
      return { userId: "2", purpose, expiresAt: new Date(at.getTime() - hour), usedAt: null, endedAt: null };
    default: {
      const token = identityMock().tokens.get(hashSecret(secret));
      return token !== undefined && token.purpose === purpose ? token : null;
    }
  }
}
