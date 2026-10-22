/**
 * `POST /api/v1/identity/users/{id}/deactivation`: deactivates a user
 * (`organization.users.manage`, ACC-10.AC7, AC8). Each session of the user ends.
 * 403 `PERM-4150` for the own account; 404 `RES-4200`; 409 `RES-4302` when the
 * user is inactive.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { deactivateUser } from "@/modules/identity/services/user-service";

export const POST = defineRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "organization.users.manage",
    allow: ["POST"],
  },
  async ({ actor, params }) => {
    await deactivateUser(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse();
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
