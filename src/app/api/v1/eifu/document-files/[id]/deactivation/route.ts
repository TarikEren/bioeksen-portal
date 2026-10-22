/**
 * `POST /api/v1/eifu/document-files/{id}/deactivation` removes a file of a
 * `DRAFT` version by deactivation (`eifu.document.manage`, IFU-20.AC9). The row
 * stays. 404 `RES-4200`; 409 `RES-4302` when the version is not `DRAFT`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { deactivateFile } from "@/modules/eifu/services/file-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const POST = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "eifu.document.manage", allow: ["POST"] },
  async ({ actor, params }) => {
    const file = await deactivateFile(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ file });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
