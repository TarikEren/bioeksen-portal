/**
 * `GET /api/v1/eifu/document-files/{id}/download-url` gives a signed URL that
 * works for 5 minutes, after the check of the permission (`eifu.document.view`,
 * DEC-076, DEC-093). The file downloads as an attachment with the name of
 * DEC-076. The answer is never cached (`Cache-Control: no-store`, set by the
 * wrapper). 404 `RES-4200`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { fileDownloadUrl } from "@/modules/eifu/services/file-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "eifu.document.view", allow: ["GET"] },
  async ({ actor, params }) => {
    const url = await fileDownloadUrl(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ url });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
