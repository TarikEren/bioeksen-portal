/**
 * The products that a document form offers (IFU-10 rule 2).
 *
 * The page reads the active products through the catalog service (DEC-004) and
 * gives the form their identity and text as data. The caller must hold
 * `catalog.product.view`, because the catalog service checks it; a page without
 * that permission shows the notice of `eifu.productNeeded` instead of the
 * choice. A document that names an inactive product keeps it in the choice, so
 * the form can show the product that the document has. This file runs on the
 * server only.
 */
import "server-only";

import type { SessionActor } from "@/lib/auth/session";
import type { Dictionary, Language } from "@/lib/i18n";
import type { ProductRef } from "@/lib/schemas/catalog";
import { MAX_LIMIT } from "@/lib/schemas/identity";
import { listProducts } from "@/modules/catalog/services/product-service";

import type { ProductOption } from "../_components/product-select";

/** What an option needs of a product. Both `ProductRef` and the rows of the product list have it. */
type ProductLike = Pick<ProductRef, "id" | "internalCode" | "name" | "regulatoryStatus">;

/** The option of one product, with the text of the active language. */
export function toProductOption(product: ProductLike, text: Dictionary, language: Language): ProductOption {
  return {
    id: product.id,
    code: product.internalCode,
    status: text.catalog.regulatoryStatus[product.regulatoryStatus],
    name: product.name[language],
  };
}

/**
 * The active products as options, sorted as the catalog sorts them, and the
 * `current` product when it is not active.
 *
 * @throws AppError `PERM-4150` without `catalog.product.view`.
 */
export async function productOptions(
  actor: SessionActor,
  text: Dictionary,
  language: Language,
  current: ProductLike | null,
): Promise<readonly ProductOption[]> {
  const page = await listProducts(actor, { page: 1, limit: MAX_LIMIT, q: null, active: true });
  const options = page.products.map((product) => toProductOption(product, text, language));
  if (current !== null && !options.some((option) => option.id === current.id)) {
    return [toProductOption(current, text, language), ...options];
  }
  return options;
}
