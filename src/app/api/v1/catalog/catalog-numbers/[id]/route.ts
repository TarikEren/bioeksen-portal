/**
 * `PATCH /api/v1/catalog/catalog-numbers/{id}` changes a catalog number with a
 * JSON Merge Patch, RFC 7396 (`catalog.catalog_number.manage`). A new
 * `productId` moves it (CAT-20.AC4). 404 `RES-4200`; 409 `RES-4302` for a move
 * while the catalog number has a LOT.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, okResponse, readPathParam } from "@/lib/http";
import { UpdateCatalogNumberInput } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { updateCatalogNumber } from "@/modules/catalog/services/catalog-number-service";

export const PATCH = defineJsonRoute(
  {
    ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.catalog_number.manage", allow: ["PATCH"] },
    bodySchema: UpdateCatalogNumberInput,
    mediaTypes: ["application/json", "application/merge-patch+json"],
  },
  async ({ actor, params, body }) => {
    const catalogNumber = await updateCatalogNumber(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ catalogNumber });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["PATCH"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
