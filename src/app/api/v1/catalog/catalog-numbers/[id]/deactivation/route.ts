/**
 * `POST /api/v1/catalog/catalog-numbers/{id}/deactivation` deactivates a catalog
 * number (`catalog.catalog_number.manage`, CAT-20.AC5). The row stays. 404
 * `RES-4200`; 409 `RES-4302` when the catalog number is inactive.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { deactivateCatalogNumber } from "@/modules/catalog/services/catalog-number-service";

export const POST = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.catalog_number.manage", allow: ["POST"] },
  async ({ actor, params }) => {
    const catalogNumber = await deactivateCatalogNumber(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ catalogNumber });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
