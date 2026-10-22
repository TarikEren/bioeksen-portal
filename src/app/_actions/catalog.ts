"use server";

/**
 * The server actions of the catalog pages (stage B2 contract, CAT-10, CAT-20,
 * CAT-40, CAT-41, CAT-60).
 *
 * A server action is a public POST endpoint, so each one does these steps in the
 * order of `sds-auth`: it needs a session (401 `AUTH-4100`), then the permission
 * of the action (403 `PERM-4150`), then it validates its argument (400 `VAL-40xx`,
 * review finding R-056), and then it calls the same service as the route handler
 * of the same operation. The service checks the permission again with the data.
 * Next.js compares `Origin` with the host (FND-07 rule 3). Each action answers
 * the envelope of `sds-api-design`.
 *
 * The pages read lists and details through the services, in server components.
 * The import actions take the same fields as the route handlers, as `FormData`
 * (DEC-054). The body limit of an action is 5 MiB (`next.config.ts`, DEC-051).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/errors";
import { formDataToObject, parseWith, runAction } from "@/lib/http";
import {
  CatalogNumberInput,
  type CatalogNumberView,
  CorrectionInput,
  CreateProductInput,
  type ImportPlan,
  LotImportFields,
  type LotImportView,
  type LotView,
  type ProductDetail,
  RegisterLotInput,
  UpdateCatalogNumberInput,
  UpdateProductInput,
} from "@/lib/schemas/catalog";
import { EntityId, type PermissionCode } from "@/lib/schemas/identity";
import { toLotImportInput } from "@/modules/catalog/import-input";
import { addCatalogNumber, deactivateCatalogNumber, updateCatalogNumber } from "@/modules/catalog/services/catalog-number-service";
import { commitImport, previewImport } from "@/modules/catalog/services/lot-import-service";
import { correctManufacturingDate, registerLot } from "@/modules/catalog/services/lot-service";
import { createProduct, deactivateProduct, updateProduct } from "@/modules/catalog/services/product-service";
import { requireCurrentActor } from "@/modules/identity/current-actor";

const IdArgument = z.strictObject({ id: EntityId });

/** The session, and the permission of the action. Nothing is validated before both pass. */
async function authorize(permission: PermissionCode): Promise<SessionActor> {
  const actor = await requireCurrentActor();
  requirePermission(actor, permission);
  return actor;
}

/** The pages that show a product, its catalog numbers and its LOTs. */
function revalidateProductPages(): void {
  revalidatePath("/backoffice/catalog/products");
  revalidatePath("/backoffice/catalog/products/[id]", "page");
}

/** Creates a product (`catalog.product.manage`). */
export async function createProductAction(input: CreateProductInput): Promise<ActionResult<{ product: ProductDetail }>> {
  return runAction("createProduct", async () => {
    const actor = await authorize("catalog.product.manage");
    const product = await createProduct(actor, parseWith(CreateProductInput, input));
    revalidateProductPages();
    return { status: "ok", product };
  });
}

/** Changes a product with a merge patch (`catalog.product.manage`). */
export async function updateProductAction(id: string, patch: UpdateProductInput): Promise<ActionResult<{ product: ProductDetail }>> {
  return runAction("updateProduct", async () => {
    const actor = await authorize("catalog.product.manage");
    const argument = parseWith(IdArgument, { id });
    const product = await updateProduct(actor, argument.id, parseWith(UpdateProductInput, patch));
    revalidateProductPages();
    return { status: "ok", product };
  });
}

/** Deactivates a product (`catalog.product.manage`). */
export async function deactivateProductAction(id: string): Promise<ActionResult<{ product: ProductDetail }>> {
  return runAction("deactivateProduct", async () => {
    const actor = await authorize("catalog.product.manage");
    const argument = parseWith(IdArgument, { id });
    const product = await deactivateProduct(actor, argument.id);
    revalidateProductPages();
    return { status: "ok", product };
  });
}

/** Adds a catalog number to a product (`catalog.catalog_number.manage`). */
export async function addCatalogNumberAction(
  productId: string,
  input: CatalogNumberInput,
): Promise<ActionResult<{ catalogNumber: CatalogNumberView }>> {
  return runAction("addCatalogNumber", async () => {
    const actor = await authorize("catalog.catalog_number.manage");
    const argument = parseWith(IdArgument, { id: productId });
    const catalogNumber = await addCatalogNumber(actor, argument.id, parseWith(CatalogNumberInput, input));
    revalidateProductPages();
    return { status: "ok", catalogNumber };
  });
}

/** Changes or moves a catalog number with a merge patch (`catalog.catalog_number.manage`). */
export async function updateCatalogNumberAction(
  id: string,
  patch: UpdateCatalogNumberInput,
): Promise<ActionResult<{ catalogNumber: CatalogNumberView }>> {
  return runAction("updateCatalogNumber", async () => {
    const actor = await authorize("catalog.catalog_number.manage");
    const argument = parseWith(IdArgument, { id });
    const catalogNumber = await updateCatalogNumber(actor, argument.id, parseWith(UpdateCatalogNumberInput, patch));
    revalidateProductPages();
    return { status: "ok", catalogNumber };
  });
}

/** Deactivates a catalog number (`catalog.catalog_number.manage`). */
export async function deactivateCatalogNumberAction(id: string): Promise<ActionResult<{ catalogNumber: CatalogNumberView }>> {
  return runAction("deactivateCatalogNumber", async () => {
    const actor = await authorize("catalog.catalog_number.manage");
    const argument = parseWith(IdArgument, { id });
    const catalogNumber = await deactivateCatalogNumber(actor, argument.id);
    revalidateProductPages();
    return { status: "ok", catalogNumber };
  });
}

/** Registers one LOT under a catalog number (`catalog.lot.manage`). */
export async function registerLotAction(
  catalogNumberId: string,
  input: RegisterLotInput,
): Promise<ActionResult<{ lot: LotView }>> {
  return runAction("registerLot", async () => {
    const actor = await authorize("catalog.lot.manage");
    const argument = parseWith(IdArgument, { id: catalogNumberId });
    const lot = await registerLot(actor, argument.id, parseWith(RegisterLotInput, input));
    revalidateProductPages();
    return { status: "ok", lot };
  });
}

/** Corrects the manufacturing date of a LOT with a reason (`catalog.lot.correct`). */
export async function correctManufacturingDateAction(
  lotId: string,
  input: CorrectionInput,
): Promise<ActionResult<{ lot: LotView }>> {
  return runAction("correctManufacturingDate", async () => {
    const actor = await authorize("catalog.lot.correct");
    const argument = parseWith(IdArgument, { id: lotId });
    const lot = await correctManufacturingDate(actor, argument.id, parseWith(CorrectionInput, input));
    revalidateProductPages();
    return { status: "ok", lot };
  });
}

/**
 * Reads an import form and answers the plan (`catalog.lot.manage`). The form has
 * the fields `text` or `file`, and the optional `productId` and `catalogNumber`
 * (DEC-054). It writes nothing.
 */
export async function previewImportAction(form: FormData): Promise<ActionResult<{ plan: ImportPlan }>> {
  return runAction("previewImport", async () => {
    const actor = await authorize("catalog.lot.manage");
    const input = await toLotImportInput(parseWith(LotImportFields, formDataToObject(form)));
    return { status: "ok", plan: await previewImport(actor, input) };
  });
}

/** Commits an import form (`catalog.lot.manage`). The form is the form of the preview. */
export async function commitImportAction(form: FormData): Promise<ActionResult<{ import: LotImportView }>> {
  return runAction("commitImport", async () => {
    const actor = await authorize("catalog.lot.manage");
    const input = await toLotImportInput(parseWith(LotImportFields, formDataToObject(form)));
    const lotImport = await commitImport(actor, input);
    revalidatePath("/backoffice/catalog/lot-imports");
    revalidateProductPages();
    return { status: "ok", import: lotImport };
  });
}
