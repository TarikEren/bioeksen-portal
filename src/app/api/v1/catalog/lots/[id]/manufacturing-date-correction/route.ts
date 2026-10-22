/**
 * `POST /api/v1/catalog/lots/{id}/manufacturing-date-correction` corrects the
 * manufacturing date of a LOT with a reason (`catalog.lot.correct`, CAT-41). 400
 * `VAL-4001` without a reason; 403 `PERM-4150` without the permission; 404
 * `RES-4200`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, okResponse, readPathParam } from "@/lib/http";
import { CorrectionInput } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { correctManufacturingDate } from "@/modules/catalog/services/lot-service";

export const POST = defineJsonRoute(
  { ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.correct", allow: ["POST"] }, bodySchema: CorrectionInput },
  async ({ actor, params, body }) => {
    const lot = await correctManufacturingDate(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ lot });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
