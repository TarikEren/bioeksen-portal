/**
 * `POST /api/v1/identity/sign-out`: ends the session and clears the cookie
 * (ACC-20 rule 4, AC8). 401 `AUTH-4100` without a session.
 */
import { requireActor } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { defineMethodNotAllowed, defineRoute, okResponse } from "@/lib/http";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { signOut } from "@/modules/identity/services/session-service";

const SPEC = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const POST = defineRoute(SPEC, async ({ actor }) => {
  await signOut(requireActor(actor).sessionId);
  await clearSessionCookie();
  return okResponse();
});

export const GET = defineMethodNotAllowed(SPEC);
export const PUT = defineMethodNotAllowed(SPEC);
export const PATCH = defineMethodNotAllowed(SPEC);
export const DELETE = defineMethodNotAllowed(SPEC);
export const OPTIONS = defineMethodNotAllowed(SPEC);
