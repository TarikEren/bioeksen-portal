/**
 * `POST /api/v1/catalog/products/{id}/catalog-numbers` adds a catalog number to a
 * product (`catalog.catalog_number.manage`, CAT-20.AC1 to AC3). 404 `RES-4200`;
 * 409 `RES-4300` when the catalog number exists under any product.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, jsonResponse, readPathParam } from "@/lib/http";
import { CatalogNumberInput } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { addCatalogNumber } from "@/modules/catalog/services/catalog-number-service";

export const POST = defineJsonRoute(
  { ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.catalog_number.manage", allow: ["POST"] }, bodySchema: CatalogNumberInput },
  async ({ actor, params, body }) => {
    const catalogNumber = await addCatalogNumber(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return jsonResponse({ status: "ok", catalogNumber }, 201, {
      Location: `/api/v1/catalog/catalog-numbers/${catalogNumber.id}`,
    });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
