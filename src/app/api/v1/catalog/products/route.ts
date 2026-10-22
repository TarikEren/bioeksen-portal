/**
 * `GET /api/v1/catalog/products` lists the products (`catalog.product.view`).
 * `POST /api/v1/catalog/products` creates a product (`catalog.product.manage`,
 * CAT-10.AC1 to AC3).
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, defineRoute, jsonResponse, okResponse } from "@/lib/http";
import { CreateProductInput, parseProductListQuery } from "@/lib/schemas/catalog";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { createProduct, listProducts } from "@/modules/catalog/services/product-service";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.product.view", allow: ["GET", "POST"] },
  async ({ request, actor }) => {
    const page = await listProducts(requireActor(actor), parseProductListQuery(request.nextUrl.searchParams));
    return okResponse(page);
  },
);

export const POST = defineJsonRoute(
  { ...{ principal: "session", resolveSession: resolveSessionActor, permission: "catalog.product.manage", allow: ["GET", "POST"] }, bodySchema: CreateProductInput },
  async ({ actor, body }) => {
    const product = await createProduct(requireActor(actor), body);
    return jsonResponse({ status: "ok", product }, 201, { Location: `/api/v1/catalog/products/${product.id}` });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET", "POST"] } as const;

export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
