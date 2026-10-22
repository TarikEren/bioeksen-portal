/**
 * `GET /api/v1/eifu/documents/{id}` gives one document with its versions, their
 * states and their periods (`eifu.document.view`). 404 `RES-4200`.
 * `PATCH /api/v1/eifu/documents/{id}` changes a document with a JSON Merge Patch,
 * RFC 7396 (`eifu.document.manage`, IFU-10.AC4). 409 `RES-4302` for a new product
 * after the first publication.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { UpdateDocumentInput } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { getDocument, updateDocument } from "@/modules/eifu/services/document-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "eifu.document.view", allow: ["GET", "PATCH"] },
  async ({ actor, params }) => {
    const document = await getDocument(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ document });
  },
);

export const PATCH = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.manage",
    allow: ["GET", "PATCH"],
    bodySchema: UpdateDocumentInput,
    mediaTypes: ["application/json", "application/merge-patch+json"],
  },
  async ({ actor, params, body }) => {
    const document = await updateDocument(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ document });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "PATCH"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
