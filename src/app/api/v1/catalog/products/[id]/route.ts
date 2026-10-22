/**
 * `GET /api/v1/catalog/products/{id}`: one product with its catalog numbers
 * (`catalog.product.view`). 404 `RES-4200` for a missing product, and for an id
 * of a wrong form.
 * `PATCH /api/v1/catalog/products/{id}` changes a product with a JSON Merge Patch,
 * RFC 7396 (`catalog.product.manage`, CAT-10.AC4). 409 `RES-4302` for the stem or
 * the status of a product with a LOT; 409 `RES-4300` for a stem and status that
 * another product has.
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { UpdateProductInput } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { getProduct, updateProduct } from "@/modules/catalog/services/product-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.product.view", allow: ["GET", "PATCH"] },
  async ({ actor, params }) => {
    const product = await getProduct(requireActor(actor), readPathParam(params, "id", EntityId));
    return okResponse({ product });
  },
);

export const PATCH = defineJsonRoute(
  { ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.product.manage", allow: ["GET", "PATCH"] }, bodySchema: UpdateProductInput, mediaTypes: ["application/json", "application/merge-patch+json"] },
  async ({ actor, params, body }) => {
    const product = await updateProduct(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ product });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "PATCH"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
