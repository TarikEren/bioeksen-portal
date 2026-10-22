/**
 * `POST /api/v1/catalog/products/{id}/deactivation` deactivates a product
 * (`catalog.product.manage`, CAT-10.AC5). The row stays. 404 `RES-4200`; 409
 * `RES-4302` when the product is inactive.
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { deactivateProduct } from "@/modules/catalog/services/product-service";

export const POST = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.product.manage", allow: ["POST"] },
  async ({ actor, params }) => {
    const product = await deactivateProduct(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ product });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
