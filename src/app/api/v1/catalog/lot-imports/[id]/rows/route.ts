/**
 * `GET /api/v1/catalog/lot-imports/{id}/rows`: the rows of an import, in pages
 * (`catalog.lot.view`, CAT-60 rule 2). 404 `RES-4200`.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { parseImportRowListQuery } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { listImportRows } from "@/modules/catalog/services/lot-import-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.view", allow: ["GET"] },
  async ({ request, actor, params }) => {
    const page = await listImportRows(
      requireActor(actor),
      readPathParam(params, "id", EntityId),
      parseImportRowListQuery(request.nextUrl.searchParams),
    );
    return okResponse(page);
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
