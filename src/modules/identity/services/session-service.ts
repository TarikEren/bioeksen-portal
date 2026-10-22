/**
 * Sign-in, sign-out and the session of a request (ACC-20, DEC-024, DEC-025).
 *
 * A wrong password, an unknown email address and an inactive account get the
 * same answer, 401 `AUTH-4101`, with the same body (ACC-20.AC2). The log record
 * holds the reason; the answer does not. Every sign-in decision is logged as
 * `SECURITY` (ACC-20 rule 5), without the email address and the password.
 */
import "server-only";

import { type SessionActor } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging";
import type { Me, SignInInput } from "@/lib/schemas/identity";
import { readExecutor } from "@/lib/transaction";

import { decoyHash, verifyPassword } from "../domain/password-hash";
import { findActiveAssignments } from "../repositories/role-repository";
import { endSession, openSession, touchSession } from "../repositories/session-repository";
import { findUserByEmail, findUserById } from "../repositories/user-repository";
import { normalizeEmail, parseEntityId, toMe } from "./identity-views";

/** What the route knows about the request, for the rate limit of ACC-20 rule 3. */
export interface SignInMeta {
  /** The value of `X-Forwarded-For`. The source address of DEC-038 comes from it, with `TRUSTED_PROXIES`. */
  readonly forwardedFor: string | null;
}

export interface SignedIn {
  /** The new session id. The caller sets the cookie. It never goes into a body or a log record. */
  readonly sessionId: string;
  readonly user: Me;
}

export interface SessionUser {
  readonly actor: SessionActor;
  readonly user: Me;
}

/** The same failure for all three causes (ACC-20.AC2). */
function signInFailure(reason: string): AppError {
  return new AppError("AUTH-4101", "Credential invalid", { reason });
}

/**
 * Signs a person in and opens a new session (ACC-20.AC1, AC9).
 *
 * @throws AppError `AUTH-4101` for a wrong password, an unknown email address
 * and an inactive account, with one body. `RATE-4400` comes with the limits of
 * stage B1 step 4 (ACC-20.AC3 to AC5).
 */
export async function signIn(input: SignInInput, meta: SignInMeta): Promise<SignedIn> {
  void meta;
  const executor = readExecutor();
  const user = await findUserByEmail(executor, normalizeEmail(input.email));
  // The password is verified in every case, against a decoy when there is no hash,
  // so the time of the answer does not tell the cases apart.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await decoyHash()));
  if (user === null) {
    throw signInFailure("no user has this email address");
  }
  if (!user.isActive) {
    throw signInFailure("the account is inactive");
  }
  if (user.passwordHash === null) {
    throw signInFailure("the account has no password yet");
  }
  if (!passwordOk) {
    throw signInFailure("the password is wrong");
  }
  const sessionId = await openSession(String(user.id));
  logger.write({ severity: "INFO", type: "SECURITY", message: "sign-in granted", tail: { sub: String(user.id) } });
  return { sessionId, user: toMe(user, await findActiveAssignments(executor, [user.id])) };
}

/** Ends a session (ACC-20 rule 4, AC8). A session that has ended already is not an error. */
export async function signOut(sessionId: string): Promise<void> {
  await endSession(sessionId);
  logger.write({ severity: "INFO", type: "SECURITY", message: "sign-out" });
}

/**
 * The actor and the user of a session id, or `null` when the id names no live
 * session (ACC-20.AC6 to AC8). The call counts as a request: it moves the idle
 * time. The permissions are read each time, so a revoked role counts at once
 * (ACC-30.AC4).
 */
export async function getSessionUser(sessionId: string): Promise<SessionUser | null> {
  const session = await touchSession(sessionId);
  if (session === null) {
    return null;
  }
  const executor = readExecutor();
  const key = parseEntityId(session.userId);
  const user = key === null ? null : await findUserById(executor, key);
  if (user === null || !user.isActive) {
    await endSession(sessionId);
    return null;
  }
  const me = toMe(user, await findActiveAssignments(executor, [user.id]));
  return {
    actor: { kind: "session", userId: me.id, sessionId, permissions: new Set(me.permissions) },
    user: me,
  };
}
