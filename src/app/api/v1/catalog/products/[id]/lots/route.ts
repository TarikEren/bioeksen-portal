/**
 * `GET /api/v1/catalog/products/{id}/lots` lists the LOTs of a product, with the
 * dates, the source of the manufacturing date and the conflict marker
 * (`catalog.lot.view`, CAT-40). 404 `RES-4200`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { parseLotListQuery } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { listLots } from "@/modules/catalog/services/lot-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.view", allow: ["GET"] },
  async ({ request, actor, params }) => {
    const page = await listLots(
      requireActor(actor),
      readPathParam(params, "id", EntityId),
      parseLotListQuery(request.nextUrl.searchParams),
    );
    return okResponse(page);
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
