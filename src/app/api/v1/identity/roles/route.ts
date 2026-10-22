/**
 * `GET /api/v1/identity/roles`: the roles with their permissions
 * (`iam.role.manage`, ACC-30).
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse } from "@/lib/http";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { listRoles } from "@/modules/identity/services/role-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "iam.role.manage", allow: ["GET"] },
  async ({ actor }) => okResponse({ roles: await listRoles(requireActor(actor)) }),
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
