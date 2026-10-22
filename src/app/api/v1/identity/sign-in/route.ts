/**
 * `POST /api/v1/identity/sign-in`: signs a person in (ACC-20, DEC-024).
 *
 * 200 `{ status, user: Me }` and the cookie `bp_session`. A wrong password, an
 * unknown email address and an inactive account get the same 401 `AUTH-4101`
 * (ACC-20.AC2). The limits of failed sign-ins (429 `RATE-4400`) come in stage B1
 * step 4.
 */
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { defineJsonRoute, defineMethodNotAllowed, okResponse } from "@/lib/http";
import { SignInInput } from "@/lib/schemas/identity";
import { signIn } from "@/modules/identity/services/session-service";

const OTHER_METHODS = { principal: "none", allow: ["POST"] } as const;

export const POST = defineJsonRoute({ principal: "none", bodySchema: SignInInput }, async ({ request, body }) => {
  const { sessionId, user } = await signIn(body, { forwardedFor: request.headers.get("x-forwarded-for") });
  await setSessionCookie(sessionId);
  return okResponse({ user });
});

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
