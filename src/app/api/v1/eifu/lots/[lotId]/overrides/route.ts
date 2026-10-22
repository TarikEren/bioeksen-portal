/**
 * `GET /api/v1/eifu/lots/{lotId}/overrides` gives the active override of a LOT
 * and its history (`eifu.document.view`). 404 `RES-4200`.
 * `POST /api/v1/eifu/lots/{lotId}/overrides` creates an override from the LOT to a
 * `PUBLISHED` or `SUPERSEDED` version of its product (`eifu.lot_override.manage`,
 * IFU-40.AC1). 400 `VAL-4006` on `documentVersionId` (AC2, AC3); 409 `RES-4300`
 * (AC4); 400 `VAL-4001` without a reason (AC5).
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, defineRoute, jsonResponse, okResponse, readPathParam } from "@/lib/http";
import { CreateOverrideInput } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { createOverride, listOverridesOfLot } from "@/modules/eifu/services/override-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "eifu.document.view", allow: ["GET", "POST"] },
  async ({ actor, params }) => {
    const overrides = await listOverridesOfLot(requireActor(actor), readPathParam(params, "lotId", EntityId));
    return okResponse({ ...overrides });
  },
);

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.lot_override.manage",
    allow: ["GET", "POST"],
    bodySchema: CreateOverrideInput,
  },
  async ({ actor, params, body }) => {
    const override = await createOverride(requireActor(actor), readPathParam(params, "lotId", EntityId), body);
    return jsonResponse({ status: "ok", override }, 201);
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "POST"] } as const;

export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
