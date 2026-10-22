/**
 * `POST /api/v1/eifu/document-files/{id}/replacement` replaces the file of a
 * `PUBLISHED` or `SUPERSEDED` version with a reason
 * (`eifu.document.replace_published_file`, IFU-32, DEC-065, DEC-092). The body is
 * `multipart/form-data` of at most 20 MiB: `reason`, `file` and the optional
 * `sha256`. The replacement keeps the language of the old file, so a
 * `languageCode` is 400 `VAL-4007` (AC4). 413 `VAL-4550`; 400 `VAL-4001` without a
 * reason (AC3); 400 `VAL-4006` on `file` for the same bytes (AC2); 409 `RES-4302`
 * (AC5); 404 `RES-4200`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineMultipartRoute, jsonResponse, readPathParam } from "@/lib/http";
import { FILE_BODY_LIMIT_BYTES, ReplacementFields } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { replacePublishedFile } from "@/modules/eifu/services/file-service";
import { toReplacementInput } from "@/modules/eifu/upload-input";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const POST = defineMultipartRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.replace_published_file",
    allow: ["POST"],
    bodySchema: ReplacementFields,
    bodyLimitBytes: FILE_BODY_LIMIT_BYTES,
  },
  async ({ actor, params, body }) => {
    const result = await replacePublishedFile(requireActor(actor), readPathParam(params, "id", EntityId), await toReplacementInput(body));
    return jsonResponse({ status: "ok", ...result }, 201);
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
