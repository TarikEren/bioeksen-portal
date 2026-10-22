/**
 * `POST /api/v1/eifu/document-versions/{id}/publication` publishes a `DRAFT`
 * version (`eifu.document.publish`, IFU-30). The body names `effectiveFrom` and
 * the product that the publisher saw (`expectedProductId`). 404 `RES-4200`; 400
 * `VAL-4006` on `effectiveFrom` (AC3, AC8); 409 `RES-4302` (AC4, AC5); 409
 * `RES-4301` when the product changed (AC6).
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, okResponse, readPathParam } from "@/lib/http";
import { PublishInput } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { publishVersion } from "@/modules/eifu/services/publication-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.publish",
    allow: ["POST"],
    bodySchema: PublishInput,
  },
  async ({ actor, params, body }) => {
    const result = await publishVersion(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ ...result });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
