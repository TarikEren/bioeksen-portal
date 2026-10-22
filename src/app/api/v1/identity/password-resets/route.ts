/**
 * `POST /api/v1/identity/password-resets`: asks for a password reset
 * (ACC-11.AC1). The answer is 202 with the same body whether or not the email
 * address belongs to an active user. A mail goes only to an active user.
 */
import { defineJsonRoute, defineMethodNotAllowed, jsonResponse } from "@/lib/http";
import { PasswordResetRequestInput } from "@/lib/schemas/identity";
import { requestPasswordReset } from "@/modules/identity/services/credential-service";

export const POST = defineJsonRoute({ principal: "none", bodySchema: PasswordResetRequestInput }, async ({ body }) => {
  await requestPasswordReset(body);
  return jsonResponse({ status: "ok" }, 202);
});

const OTHER_METHODS = { principal: "none", allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
