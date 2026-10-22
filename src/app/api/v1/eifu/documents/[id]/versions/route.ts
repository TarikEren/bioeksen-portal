/**
 * `POST /api/v1/eifu/documents/{id}/versions` creates a version as `DRAFT`
 * (`eifu.document.manage`, IFU-10.AC3). 404 `RES-4200`; 409 `RES-4300` for a
 * revision label that the document has.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, jsonResponse, readPathParam } from "@/lib/http";
import { CreateVersionInput } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { createVersion } from "@/modules/eifu/services/document-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.manage",
    allow: ["POST"],
    bodySchema: CreateVersionInput,
  },
  async ({ actor, params, body }) => {
    const version = await createVersion(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return jsonResponse({ status: "ok", version }, 201, { Location: `/api/v1/eifu/document-versions/${version.id}` });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
