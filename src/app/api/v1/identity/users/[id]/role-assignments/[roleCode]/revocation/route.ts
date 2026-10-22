/**
 * `POST /api/v1/identity/users/{id}/role-assignments/{roleCode}/revocation`:
 * revokes a role (`iam.role.manage`, ACC-31.AC4). The assignment stays with
 * `isActive` false (DEC-010). 404 `RES-4200` when the user has no active
 * assignment of the role, and for an id or a role code of a wrong form.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId, RoleCode } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { revokeRole } from "@/modules/identity/services/role-service";

export const POST = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "iam.role.manage", allow: ["POST"] },
  async ({ actor, params }) => {
    const roleAssignment = await revokeRole(
      requireActor(actor),
      readPathParam(params, "id", EntityId),
      readPathParam(params, "roleCode", RoleCode),
    );
    return okResponse({ roleAssignment });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
