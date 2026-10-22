/**
 * `GET /api/v1/identity/users` lists the users (`organization.users.view`).
 * `POST /api/v1/identity/users` creates a user and sends one invitation after
 * the commit (`organization.users.manage`, ACC-10.AC1, AC2).
 *
 * A route declares its permission, so a refusal (403 `PERM-4150`) comes before
 * the body is read. The service checks the permission again with the data.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, defineRoute, jsonResponse, okResponse } from "@/lib/http";
import { CreateUserInput, parseUserListQuery } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { createUser, listUsers } from "@/modules/identity/services/user-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "organization.users.view" },
  async ({ request, actor }) => {
    const page = await listUsers(requireActor(actor), parseUserListQuery(request.nextUrl.searchParams));
    return okResponse(page);
  },
);

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "organization.users.manage",
    bodySchema: CreateUserInput,
  },
  async ({ actor, body }) => {
    const user = await createUser(requireActor(actor), body);
    return jsonResponse({ status: "ok", user }, 201, { Location: `/api/v1/identity/users/${user.id}` });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "POST"] } as const;

export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
