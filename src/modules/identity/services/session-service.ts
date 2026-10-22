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
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging";
import {
  type ConsecutiveLimit,
  type WindowLimit,
  assertBelowLimit,
  assertNotLocked,
  clearConsecutiveFailures,
  recordConsecutiveFailure,
  recordFailure,
} from "@/lib/rate-limit";
import { resolveForwardedSource } from "@/lib/security";
import type { Me, SignInInput } from "@/lib/schemas/identity";
import { readExecutor } from "@/lib/transaction";

import { decoyHash, verifyPassword } from "../domain/password-hash";
import { findActiveAssignments } from "../repositories/role-repository";
import { endSession, openSession, touchSession } from "../repositories/session-repository";
import { findUserByEmail, findUserById } from "../repositories/user-repository";
import { normalizeEmail, parseEntityId, toMe } from "./identity-views";

/** DEC-027: 10 failed sign-ins in one minute for each source address. */
const SOURCE_LIMIT: WindowLimit = { limit: 10, windowMs: 60_000 };
/** DEC-027: after 5 failed sign-ins in a row with one email address, the address is locked for 15 minutes. */
const EMAIL_LIMIT: ConsecutiveLimit = { threshold: 5, lockMs: 15 * 60_000 };

const SOURCE_SCOPE = "sign-in-source";
const EMAIL_SCOPE = "sign-in-email";
/** The source of a request that carries no address. All such requests share one count. */
const UNKNOWN_SOURCE = "unknown";

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
 * The limits of DEC-027 come first (step 1 of the order of `sds-auth`): 10
 * failed sign-ins in a minute for a source address, and 5 in a row for an email
 * address. A limited request is 429 before the password is looked at, also when
 * the password is right (ACC-20.AC3 to AC5). The email address counts whether or
 * not it has an account.
 *
 * @throws AppError `AUTH-4101` for a wrong password, an unknown email address
 * and an inactive account, with one body; `RATE-4400` (with `Retry-After`) over a limit.
 */
export async function signIn(input: SignInInput, meta: SignInMeta): Promise<SignedIn> {
  const source = resolveForwardedSource(meta.forwardedFor, getConfig().TRUSTED_PROXIES ?? []) ?? UNKNOWN_SOURCE;
  const emailNormalized = normalizeEmail(input.email);
  await assertBelowLimit(SOURCE_SCOPE, source, SOURCE_LIMIT);
  await assertNotLocked(EMAIL_SCOPE, emailNormalized);

  const executor = readExecutor();
  const user = await findUserByEmail(executor, emailNormalized);
  // The password is verified in every case, against a decoy when there is no hash,
  // so the time of the answer does not tell the cases apart.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await decoyHash()));
  const failure =
    user === null
      ? "no user has this email address"
      : !user.isActive
        ? "the account is inactive"
        : user.passwordHash === null
          ? "the account has no password yet"
          : !passwordOk
            ? "the password is wrong"
            : null;
  if (user === null || failure !== null) {
    await recordFailure(SOURCE_SCOPE, source, SOURCE_LIMIT);
    await recordConsecutiveFailure(EMAIL_SCOPE, emailNormalized, EMAIL_LIMIT);
    throw signInFailure(failure ?? "the password is wrong");
  }

  await clearConsecutiveFailures(EMAIL_SCOPE, emailNormalized);
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
