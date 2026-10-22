/**
 * `POST /api/v1/identity/invitations/accept`: the person opens the account by
 * setting a password (ACC-10.AC3 to AC5, DEC-138). The token is in the body, not
 * in the path or the query. 401 `AUTH-4101` for a used or ended link; 401
 * `AUTH-4102` for a link older than 14 days; 400 `VAL-4006` with each broken
 * rule in `details`.
 */
import { defineJsonRoute, defineMethodNotAllowed, okResponse } from "@/lib/http";
import { SetPasswordInput } from "@/lib/schemas/identity";
import { acceptInvitation } from "@/modules/identity/services/credential-service";

export const POST = defineJsonRoute({ principal: "none", bodySchema: SetPasswordInput }, async ({ body }) => {
  await acceptInvitation(body);
  return okResponse();
});

const OTHER_METHODS = { principal: "none", allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
