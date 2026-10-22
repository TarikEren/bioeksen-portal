/**
 * `POST /api/v1/identity/users/{id}/role-assignments`: grants a role
 * (`iam.role.manage`, ACC-31). 201 with the assignment and `Location`. 403
 * `PERM-4150` for the own account; 409 `RES-4300` when the user holds the role;
 * 409 `RES-4302` for an inactive user; 404 `RES-4200` for a missing user.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, jsonResponse, readPathParam } from "@/lib/http";
import { EntityId, GrantRoleInput } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { grantRole } from "@/modules/identity/services/role-service";

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "iam.role.manage",
    allow: ["POST"],
    bodySchema: GrantRoleInput,
  },
  async ({ actor, params, body }) => {
    const userId = readPathParam(params, "id", EntityId);
    const roleAssignment = await grantRole(requireActor(actor), userId, body.roleCode);
    return jsonResponse({ status: "ok", roleAssignment }, 201, {
      Location: `/api/v1/identity/users/${userId}/role-assignments/${roleAssignment.roleCode}`,
    });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
