/**
 * `POST /api/v1/identity/password-resets/complete`: sets the new password
 * (ACC-11.AC2 to AC5, DEC-138). Each session of the user ends. 401 `AUTH-4102`
 * for a link older than 1 hour; 401 `AUTH-4101` for a used link; 400 `VAL-4006`
 * for a password that breaks a rule, also the current password.
 */
import { defineJsonRoute, defineMethodNotAllowed, okResponse } from "@/lib/http";
import { SetPasswordInput } from "@/lib/schemas/identity";
import { completePasswordReset } from "@/modules/identity/services/credential-service";

export const POST = defineJsonRoute({ principal: "none", bodySchema: SetPasswordInput }, async ({ body }) => {
  await completePasswordReset(body);
  return okResponse();
});

const OTHER_METHODS = { principal: "none", allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
