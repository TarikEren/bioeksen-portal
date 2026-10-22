/**
 * `POST /api/v1/eifu/lot-overrides/{id}/deactivation` ends an override with a
 * reason (`eifu.lot_override.manage`, IFU-40.AC6). The row stays. 400 `VAL-4001`
 * without a reason (AC7); 404 `RES-4200`; 409 `RES-4302` when the override ended.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, okResponse, readPathParam } from "@/lib/http";
import { EndOverrideInput } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { endOverride } from "@/modules/eifu/services/override-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.lot_override.manage",
    allow: ["POST"],
    bodySchema: EndOverrideInput,
  },
  async ({ actor, params, body }) => {
    const override = await endOverride(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ override });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
