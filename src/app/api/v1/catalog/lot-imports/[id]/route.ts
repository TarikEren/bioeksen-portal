/**
 * `GET /api/v1/catalog/lot-imports/{id}`: one import with its counts
 * (`catalog.lot.view`, CAT-60 rule 2). 404 `RES-4200`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { getImport } from "@/modules/catalog/services/lot-import-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.view", allow: ["GET"] },
  async ({ actor, params }) => {
    const lotImport = await getImport(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ import: lotImport });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
