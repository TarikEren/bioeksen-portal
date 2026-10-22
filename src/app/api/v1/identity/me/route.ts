/**
 * `GET /api/v1/identity/me`: the signed-in user (ACC-20.AC1, ACC-50). 401
 * `AUTH-4100` without a session.
 */
import { defineMethodNotAllowed, defineRoute, okResponse } from "@/lib/http";
import { requireCurrentSession, resolveSessionActor } from "@/modules/identity/current-actor";

const SPEC = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const GET = defineRoute(SPEC, async () => {
  const { user } = await requireCurrentSession();
  return okResponse({ user });
});

export const POST = defineMethodNotAllowed(SPEC);
export const PUT = defineMethodNotAllowed(SPEC);
export const PATCH = defineMethodNotAllowed(SPEC);
export const DELETE = defineMethodNotAllowed(SPEC);
export const OPTIONS = defineMethodNotAllowed(SPEC);
