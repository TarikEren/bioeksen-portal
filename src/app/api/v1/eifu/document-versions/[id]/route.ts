/**
 * `GET /api/v1/eifu/document-versions/{id}` gives one version with its files, its
 * period and its replacements (`eifu.document.view`). 404 `RES-4200`.
 * `PATCH /api/v1/eifu/document-versions/{id}` changes the proposed start of a
 * `DRAFT` version with a JSON Merge Patch (`eifu.document.manage`, IFU-10.AC5).
 * 409 `RES-4302` when the version is not `DRAFT` (IFU-10.AC6).
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { UpdateVersionInput } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { getVersion, updateVersion } from "@/modules/eifu/services/document-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "eifu.document.view", allow: ["GET", "PATCH"] },
  async ({ actor, params }) => {
    const version = await getVersion(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ version });
  },
);

export const PATCH = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.manage",
    allow: ["GET", "PATCH"],
    bodySchema: UpdateVersionInput,
    mediaTypes: ["application/json", "application/merge-patch+json"],
  },
  async ({ actor, params, body }) => {
    const version = await updateVersion(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ version });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "PATCH"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
