/**
 * The cookie `bp_session` in a route handler, a server action and a page
 * (ACC-20.AC1, DEC-024).
 *
 * The cookie has `HttpOnly`, `SameSite=Lax` and, when `PUBLIC_BASE_URL` is
 * HTTPS, `Secure`. It has no `Max-Age`, so it ends with the browser session.
 * Only a route handler or a server action sets it: no page sets a cookie while
 * it renders (`sds-nextjs-backend` §3).
 */
import "server-only";

import { cookies } from "next/headers";

import { isPublicBaseUrlSecure } from "@/lib/config";

import { SESSION_COOKIE, parseSessionId } from "./session";

/** The session id of the current request, or `null` when the request has no valid cookie. */
export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return parseSessionId(store.get(SESSION_COOKIE)?.value);
}

/** Sets the cookie after a sign-in. */
export async function setSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isPublicBaseUrlSecure(),
  });
}

/** Clears the cookie after a sign-out. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isPublicBaseUrlSecure(),
    maxAge: 0,
  });
}
