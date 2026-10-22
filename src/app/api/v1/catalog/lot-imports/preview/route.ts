/**
 * `POST /api/v1/catalog/lot-imports/preview` reads an import input and answers
 * the plan: each row with its outcome and reason, grouped by product, the counts,
 * and the earlier import with the same hash (`catalog.lot.manage`, CAT-60 rule 1).
 * It writes nothing. The body is `multipart/form-data` of at most 5 MiB (DEC-051,
 * DEC-054).
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineMultipartRoute, okResponse } from "@/lib/http";
import { IMPORT_BODY_LIMIT_BYTES, LotImportFields } from "@/lib/schemas/catalog";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { toLotImportInput } from "@/modules/catalog/import-input";
import { previewImport } from "@/modules/catalog/services/lot-import-service";

export const POST = defineMultipartRoute(
  { ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.manage", allow: ["POST"] }, bodySchema: LotImportFields, bodyLimitBytes: IMPORT_BODY_LIMIT_BYTES },
  async ({ actor, body }) => {
    const plan = await previewImport(requireActor(actor), await toLotImportInput(body));
    return okResponse({ plan });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
