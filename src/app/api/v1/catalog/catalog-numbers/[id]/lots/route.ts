/**
 * `POST /api/v1/catalog/catalog-numbers/{id}/lots` registers one LOT
 * (`catalog.lot.manage`, CAT-30, CAT-40, CAT-50). 404 `RES-4200`; 409 `RES-4300`
 * for a LOT number that the catalog number has; 400 `VAL-4006` on `lotNumber` or
 * `expiryDate`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, jsonResponse, readPathParam } from "@/lib/http";
import { RegisterLotInput } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { registerLot } from "@/modules/catalog/services/lot-service";

export const POST = defineJsonRoute(
  { ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.manage", allow: ["POST"] }, bodySchema: RegisterLotInput },
  async ({ actor, params, body }) => {
    const lot = await registerLot(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return jsonResponse({ status: "ok", lot }, 201, { Location: `/api/v1/catalog/lots/${lot.id}` });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
