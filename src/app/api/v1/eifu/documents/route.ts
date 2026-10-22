/**
 * `GET /api/v1/eifu/documents` lists the documents with their product and the
 * version in force today (`eifu.document.view`).
 * `POST /api/v1/eifu/documents` creates a document (`eifu.document.manage`,
 * IFU-10.AC1, AC2). 409 `RES-4300` for a document number that exists; 400
 * `VAL-4001` for a blank title entry; 400 `VAL-4006` on `productId` for a product
 * that does not exist.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, defineRoute, jsonResponse, okResponse } from "@/lib/http";
import { CreateDocumentInput, parseDocumentListQuery } from "@/lib/schemas/eifu";
import { createDocument, listDocuments } from "@/modules/eifu/services/document-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "eifu.document.view", allow: ["GET", "POST"] },
  async ({ request, actor }) => {
    const page = await listDocuments(requireActor(actor), parseDocumentListQuery(request.nextUrl.searchParams));
    return okResponse(page);
  },
);

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.manage",
    allow: ["GET", "POST"],
    bodySchema: CreateDocumentInput,
  },
  async ({ actor, body }) => {
    const document = await createDocument(requireActor(actor), body);
    return jsonResponse({ status: "ok", document }, 201, { Location: `/api/v1/eifu/documents/${document.id}` });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "POST"] } as const;

export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
