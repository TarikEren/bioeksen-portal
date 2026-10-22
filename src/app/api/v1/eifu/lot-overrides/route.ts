/**
 * `GET /api/v1/eifu/lot-overrides` lists the overrides of all LOTs, the active
 * ones first (`eifu.document.view`, DEC-094). The filter `active` is `true` or
 * `false`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse } from "@/lib/http";
import { parseLotOverrideListQuery } from "@/lib/schemas/eifu";
import { listOverrides } from "@/modules/eifu/services/override-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "eifu.document.view", allow: ["GET"] },
  async ({ request, actor }) => {
    const page = await listOverrides(requireActor(actor), parseLotOverrideListQuery(request.nextUrl.searchParams));
    return okResponse(page);
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
