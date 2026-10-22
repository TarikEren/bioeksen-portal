/**
 * `GET /api/v1/catalog/lot-imports` lists the imports, newest first
 * (`catalog.lot.view`, DEC-056).
 * `POST /api/v1/catalog/lot-imports` commits an import (`catalog.lot.manage`,
 * CAT-60). The body is `multipart/form-data` of at most 5 MiB (DEC-051,
 * DEC-054). 201 with `Location`; 413 `VAL-4550`; 415 `VAL-4600`; 400 `VAL-4001`
 * without text and file; 400 `VAL-4006` for each fault of the input.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineMultipartRoute, defineRoute, jsonResponse, okResponse } from "@/lib/http";
import { IMPORT_BODY_LIMIT_BYTES, LotImportFields, parseImportListQuery } from "@/lib/schemas/catalog";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { toLotImportInput } from "@/modules/catalog/import-input";
import { commitImport, listImports } from "@/modules/catalog/services/lot-import-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.view", allow: ["GET", "POST"] },
  async ({ request, actor }) => {
    const page = await listImports(requireActor(actor), parseImportListQuery(request.nextUrl.searchParams));
    return okResponse(page);
  },
);

export const POST = defineMultipartRoute(
  { ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.manage", allow: ["GET", "POST"] }, bodySchema: LotImportFields, bodyLimitBytes: IMPORT_BODY_LIMIT_BYTES },
  async ({ actor, body }) => {
    const lotImport = await commitImport(requireActor(actor), await toLotImportInput(body));
    return jsonResponse({ status: "ok", import: lotImport }, 201, {
      Location: `/api/v1/catalog/lot-imports/${lotImport.id}`,
    });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "POST"] } as const;

export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
