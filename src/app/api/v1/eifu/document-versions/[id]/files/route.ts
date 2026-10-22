/**
 * `POST /api/v1/eifu/document-versions/{id}/files` uploads a PDF to a `DRAFT`
 * version (`eifu.document.manage`, IFU-20 rule 1, DEC-092). The body is
 * `multipart/form-data` of at most 20 MiB (IFU-20 rule 2): `languageCode`, `file`
 * and the optional `sha256`. The server reads the type from the bytes.
 * 413 `VAL-4550` over the limit (AC3); 415 `VAL-4600`; 400 `VAL-4006` on `file`
 * (not a PDF, no bytes, a hash that differs) or on `languageCode`; 409 `RES-4300`
 * (AC4); 409 `RES-4302` (AC5); 404 `RES-4200`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineMultipartRoute, jsonResponse, readPathParam } from "@/lib/http";
import { FILE_BODY_LIMIT_BYTES, FileUploadFields } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { uploadFile } from "@/modules/eifu/services/file-service";
import { toFileUploadInput } from "@/modules/eifu/upload-input";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const POST = defineMultipartRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.manage",
    allow: ["POST"],
    bodySchema: FileUploadFields,
    bodyLimitBytes: FILE_BODY_LIMIT_BYTES,
  },
  async ({ actor, params, body }) => {
    const file = await uploadFile(requireActor(actor), readPathParam(params, "id", EntityId), await toFileUploadInput(body));
    return jsonResponse({ status: "ok", file }, 201);
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
