/**
 * `POST /api/test/session`: the test sign-in (FND-03 rule 4). The body is
 * `{ userId }`. It opens a session for the user, with no password, sets the
 * cookie `bp_session` and answers `{ status: "ok", user: Me }`. It answers 404
 * `RES-4200` unless `TEST_SEAMS_ENABLED` is `true` and `APP_ENV` is
 * `development` or `test`.
 */
import { z } from "zod";

import { setSessionCookie } from "@/lib/auth/session-cookie";
import { defineJsonRoute, defineMethodNotAllowed, okResponse } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { openTestSession } from "@/modules/identity/services/test-session-service";

const BodySchema = z.strictObject({ userId: EntityId });

export const POST = defineJsonRoute({ principal: "none", testSeam: true, bodySchema: BodySchema }, async ({ body }) => {
  const { sessionId, user } = await openTestSession(body.userId);
  await setSessionCookie(sessionId);
  return okResponse({ user });
});

const OTHER_METHODS = { principal: "none", testSeam: true, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
