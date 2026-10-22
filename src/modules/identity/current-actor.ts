/**
 * The session of the current request, for a route, a page, a layout and a
 * server action (ACC-20, ACC-30).
 *
 * A route handler declares `principal: "session"` and the wrapper does the rest;
 * it takes `resolveSessionActor` as its resolver. A page, a layout or a server
 * action calls `getCurrentSession` or `requireCurrentSession`. Both read the
 * cookie `bp_session`, so the cookie is never read twice in two forms.
 *
 * A check on a page is not an authorization layer. A service checks the
 * permission with the data (`sds-nextjs-backend` §3). A page uses the answer to
 * decide what to show, and a server action passes the actor to a service.
 */
import "server-only";

import type { SessionActor, SessionResolver } from "@/lib/auth/session";
import { readSessionId } from "@/lib/auth/session-cookie";
import { AppError } from "@/lib/errors";

import { type SessionUser, getSessionUser } from "./services/session-service";

export type { SessionUser } from "./services/session-service";

/** The resolver for `defineRoute({ principal: "session", resolveSession })`. */
export const resolveSessionActor: SessionResolver = async (sessionId) => {
  const found = await getSessionUser(sessionId);
  return found === null ? null : found.actor;
};

/**
 * The actor and the user of the current request, or `null` when the request has
 * no live session. A page sends the person to `/sign-in` when it gets `null`.
 */
export async function getCurrentSession(): Promise<SessionUser | null> {
  const sessionId = await readSessionId();
  return sessionId === null ? null : getSessionUser(sessionId);
}

/**
 * The actor and the user of the current request.
 *
 * @throws AppError `AUTH-4100` when the request has no live session. A server
 * action lets `runAction` turn it into the failure envelope.
 */
export async function requireCurrentSession(): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (session === null) {
    throw new AppError("AUTH-4100", "Credential missing", { reason: "no live session for the page or the action" });
  }
  return session;
}

/** The actor of the current request, for a server action that calls a service. */
export async function requireCurrentActor(): Promise<SessionActor> {
  return (await requireCurrentSession()).actor;
}
