/**
 * The session principal (stage B1 contract, ACC-20, ACC-30, DEC-024).
 *
 * A signed-in person is a `SessionActor`: the user id and the set of permission
 * codes. The cookie `bp_session` names the session. The cookie holds a random
 * id and nothing else; the server holds the session.
 *
 * `src/lib/` never imports `src/modules/` (FND-01.AC4). The module `identity`
 * owns the sessions, so the route wrapper takes a `SessionResolver` that the
 * route gives it, and the wrapper does not know where the sessions are.
 *
 * This file is pure: it has no `server-only` mark, because the proxy uses the
 * cookie name.
 */
import { AppError } from "@/lib/errors";
import type { PermissionCode } from "@/lib/schemas/identity";

/**
 * The cookie of the session (DEC-024). It lasts as long as the browser session.
 * The server ends the session (DEC-025).
 */
export const SESSION_COOKIE = "bp_session";

/** The id of a session: 32 random bytes as base64url. A cookie with another form is no session. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The session id of a cookie value, or `null` when the value is absent or has a form that no id has. */
export function parseSessionId(value: string | undefined): string | null {
  return value !== undefined && SESSION_ID_PATTERN.test(value) ? value : null;
}

/** The caller that a route authenticated through the cookie. */
export interface SessionActor {
  readonly kind: "session";
  /** The id of the user, as the text of the `bigint` key (DEC-009). */
  readonly userId: string;
  /** The id of the session, the secret of the cookie. It never goes into a log record or an answer. */
  readonly sessionId: string;
  readonly permissions: ReadonlySet<PermissionCode>;
}

/**
 * Finds the actor of a session id. It returns `null` for an id that names no
 * live session: unknown, ended, idle for 60 minutes, or 12 hours old (DEC-025).
 */
export type SessionResolver = (sessionId: string) => Promise<SessionActor | null>;

/**
 * The actor that a route authenticated, or a refusal if there is none. The
 * services take a `SessionActor`, so a caller without a check cannot call them
 * (`sds-nextjs-backend` §1 and §3).
 *
 * @throws AppError `AUTH-4100` when `actor` is `null`.
 */
export function requireActor(actor: SessionActor | null): SessionActor {
  if (actor === null) {
    throw new AppError("AUTH-4100", "Credential missing", { reason: "no session principal" });
  }
  return actor;
}

/**
 * The credential step of a route that needs a session (ACC-30 rule 2). It runs
 * before the body is read, so a caller without a session learns nothing about
 * the shape of the payload.
 *
 * Without a cookie, and with a cookie that names no live session, the person is
 * not signed in: 401 `AUTH-4100`. The log record holds the reason (ACC-20.AC6
 * to AC8).
 *
 * @param sessionId The session id of the cookie, `null` when absent or malformed.
 * @param resolve Finds the actor of the session id.
 * @param permission The permission that the route needs, if any.
 * @throws AppError `AUTH-4100`, `PERM-4150`.
 */
export async function authenticateSession(
  sessionId: string | null,
  resolve: SessionResolver,
  permission?: PermissionCode,
): Promise<SessionActor> {
  if (sessionId === null) {
    throw new AppError("AUTH-4100", "Credential missing", { reason: "no session cookie" });
  }
  const actor = await resolve(sessionId);
  if (actor === null) {
    throw new AppError("AUTH-4100", "Credential missing", { reason: "the session is unknown, ended or expired" });
  }
  if (permission !== undefined) {
    requirePermission(actor, permission);
  }
  return actor;
}

/**
 * Checks that the actor holds a permission (DEC-029). A service calls it with
 * the data it guards; the route checks too, so a refusal comes before the body
 * is read.
 *
 * @throws AppError `PERM-4150`.
 */
export function requirePermission(actor: SessionActor, permission: PermissionCode): void {
  if (!actor.permissions.has(permission)) {
    // The answer never names the permission. The log record does not either: it holds the actor only.
    throw new AppError("PERM-4150", "Not permitted", { reason: "the actor lacks a permission of the action" });
  }
}
