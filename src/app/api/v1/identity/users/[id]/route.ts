/**
 * `GET /api/v1/identity/users/{id}`: one user with the active roles
 * (`organization.users.view`). 404 `RES-4200` for a missing user, and for an id
 * of a wrong form.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { getUser } from "@/modules/identity/services/user-service";

export const GET = defineRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "organization.users.view",
    allow: ["GET"],
  },
  async ({ actor, params }) => {
    const user = await getUser(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ user });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
