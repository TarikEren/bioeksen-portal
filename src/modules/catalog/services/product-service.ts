/**
 * Products (CAT-10).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * runs in one transaction with its audit row (PLT-40). The stem and the
 * regulatory status change only while the product has no LOT (CAT-10 rule 3).
 * The system never deletes a product (DEC-010).
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { type Executor, readExecutor, runTransaction, violatedConstraint } from "@/lib/transaction";
import type {
  CreateProductInput,
  LocalizedDescription,
  LocalizedName,
  ProductDetail,
  ProductListPage,
  ProductListQuery,
  UpdateProductInput,
} from "@/lib/schemas/catalog";

import {
  findProductIdsByCatalogNumberContaining,
  listCatalogNumbersOfProducts,
} from "../repositories/catalog-number-repository";
import { countLotsByCatalogNumber, countLotsOfCatalogNumbers } from "../repositories/lot-repository";
import {
  type ProductRow,
  findProductById,
  findProductByIdentity,
  insertProduct,
  listProductRows,
  markProductInactive,
  updateProductRow,
} from "../repositories/product-repository";
import { type CatalogAuditState, recordAudit } from "./catalog-audit";
import { notFound, pageOf, requireCatalogId, toProductDetail, toProductSummary } from "./catalog-views";

/** 400 `VAL-4001` with one entry for each blank entry of a localized text (CAT-10.AC3). A blank text is an absent text. */
function missingEntries(field: string, entries: Readonly<Record<"tr" | "en", string | null | undefined>>): AppError | null {
  const faults: FieldIssue[] = (["tr", "en"] as const)
    .filter((language) => (entries[language]?.trim() ?? "") === "")
    .map((language) => ({ field: `${field}.${language}`, issue: "is required" }));
  return faults.length === 0 ? null : validationError(faults.map((entry) => ({ code: "VAL-4001", entry })));
}

function duplicateIdentity(): AppError {
  return new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "a product has the stem and the regulatory status" });
}

function lockedByLot(): AppError {
  return new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the stem or the status of a product with a LOT" });
}

/** The trigger `product_identity_is_settled` refuses a new stem or status while a document names the product (IFU-10 rule 5, DEC-096). */
const SETTLED_BY_DOCUMENT_RULE = "product_identity_is_settled";

function lockedByDocument(): AppError {
  return new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the stem or the status of a product that a document names" });
}

/** The product with the text id, locked for a change when `lock` is set. @throws AppError `RES-4200`. */
async function requireProduct(executor: Executor, id: string, lock: "none" | "update" = "none"): Promise<ProductRow> {
  const key = requireCatalogId(id);
  const product = await findProductById(executor, key, lock);
  if (product === null) {
    throw notFound();
  }
  return product;
}

/** The fields of a product that the audit row shows. */
function auditState(product: Pick<ProductRow, "internalCode" | "name" | "description" | "regulatoryStatus" | "kitCodeBase" | "isActive">): CatalogAuditState {
  return {
    internalCode: product.internalCode,
    name: product.name,
    description: product.description,
    regulatoryStatus: product.regulatoryStatus,
    kitCodeBase: product.kitCodeBase,
    isActive: product.isActive,
  };
}

/** The product with its catalog numbers and the LOT counts. */
async function detailOf(executor: Executor, product: ProductRow): Promise<ProductDetail> {
  const catalogNumbers = await listCatalogNumbersOfProducts(executor, [product.id]);
  const lotCounts = await countLotsByCatalogNumber(
    executor,
    catalogNumbers.map((row) => row.id),
  );
  return toProductDetail(product, catalogNumbers, lotCounts);
}

/** Whether the text is in the stem or in the name of either language. */
function matchesText(product: ProductRow, needle: string): boolean {
  return [product.internalCode, product.name.tr, product.name.en].some((text) => text.toLocaleLowerCase("tr").includes(needle));
}

/**
 * Lists the products, one page, in the order of the stem and the status. The
 * search matches the stem, the name in either language and a catalog number.
 *
 * @throws AppError `PERM-4150` without `catalog.product.view`.
 */
export async function listProducts(actor: SessionActor, query: ProductListQuery): Promise<ProductListPage> {
  requirePermission(actor, "catalog.product.view");
  const executor = readExecutor();
  let matching = await listProductRows(executor, query.active);
  if (query.q !== null) {
    const needle = query.q.toLocaleLowerCase("tr");
    const ownersOfCatalogNumber = new Set(await findProductIdsByCatalogNumberContaining(executor, query.q));
    matching = matching.filter((product) => ownersOfCatalogNumber.has(product.id) || matchesText(product, needle));
  }
  const { slice, totalCount } = pageOf(matching, query);
  const catalogNumbers = await listCatalogNumbersOfProducts(
    executor,
    slice.map((product) => product.id),
  );
  const lotCounts = await countLotsByCatalogNumber(
    executor,
    catalogNumbers.map((row) => row.id),
  );
  const products = slice.map((product) =>
    toProductSummary(
      product,
      catalogNumbers.filter((row) => row.productId === product.id),
      lotCounts,
    ),
  );
  return { page: query.page, count: products.length, totalCount, products, filterParams: query };
}

/**
 * Creates a product (CAT-10.AC1). The creation has one audit row.
 *
 * @throws AppError `PERM-4150` without `catalog.product.manage`; `VAL-4001` when
 * the name or the description lacks an entry (CAT-10.AC3); `RES-4300` when a
 * product has the stem and the status (CAT-10.AC2).
 */
export async function createProduct(actor: SessionActor, input: CreateProductInput): Promise<ProductDetail> {
  requirePermission(actor, "catalog.product.manage");
  const nameFault = missingEntries("name", input.name);
  if (nameFault !== null) {
    throw nameFault;
  }
  const descriptionFault = input.description === undefined ? null : missingEntries("description", input.description);
  if (descriptionFault !== null) {
    throw descriptionFault;
  }
  return runTransaction(async (tx) => {
    // A second creation with the same identity between this check and the insert
    // fails on `product_unique_identity` with the same `RES-4300`.
    if ((await findProductByIdentity(tx, input.internalCode, input.regulatoryStatus)) !== null) {
      throw duplicateIdentity();
    }
    const product = await insertProduct(tx, {
      internalCode: input.internalCode,
      name: { tr: input.name.tr.trim(), en: input.name.en.trim() },
      description:
        input.description === undefined ? null : { tr: input.description.tr.trim(), en: input.description.en.trim() },
      regulatoryStatus: input.regulatoryStatus,
      kitCodeBase: input.kitCodeBase ?? null,
      now: now(),
    });
    await recordAudit(tx, actor, {
      actionCode: "catalog.product.created",
      entityType: "catalog_product",
      entityId: String(product.id),
      stateBefore: null,
      stateAfter: auditState(product),
    });
    return toProductDetail(product, [], new Map());
  });
}

/**
 * One product with its catalog numbers.
 *
 * @throws AppError `PERM-4150` without `catalog.product.view`; `RES-4200`.
 */
export async function getProduct(actor: SessionActor, id: string): Promise<ProductDetail> {
  requirePermission(actor, "catalog.product.view");
  const executor = readExecutor();
  return detailOf(executor, await requireProduct(executor, id));
}

/** The localized text after a merge patch: a member that the patch names replaces, and `null` removes. */
function mergeEntries(
  current: Readonly<Record<"tr" | "en", string | null>>,
  patch: { readonly tr?: string | null | undefined; readonly en?: string | null | undefined },
): Record<"tr" | "en", string | null> {
  return {
    tr: patch.tr === undefined ? current.tr : patch.tr,
    en: patch.en === undefined ? current.en : patch.en,
  };
}

function toName(merged: Record<"tr" | "en", string | null>): LocalizedName {
  return { tr: (merged.tr ?? "").trim(), en: (merged.en ?? "").trim() };
}

function toDescription(merged: Record<"tr" | "en", string | null>): LocalizedDescription {
  return { tr: (merged.tr ?? "").trim(), en: (merged.en ?? "").trim() };
}

/**
 * Changes a product with a JSON Merge Patch (RFC 7396). A patch that changes
 * nothing writes no audit row. The change has one audit row, with the fields
 * before and after.
 *
 * @throws AppError `PERM-4150` without `catalog.product.manage`; `RES-4200`;
 * `VAL-4001` when the name or the description would lack an entry; `RES-4302`
 * when the stem or the status changes and the product has a LOT (CAT-10.AC4);
 * `RES-4300` when another product has the new stem and status.
 */
export async function updateProduct(actor: SessionActor, id: string, patch: UpdateProductInput): Promise<ProductDetail> {
  requirePermission(actor, "catalog.product.manage");
  return runTransaction(async (tx) => {
    // The row stays locked until the commit: a LOT registration takes a shared
    // lock of the product, so it cannot slip in between the check and the write.
    const product = await requireProduct(tx, id, "update");

    const name = patch.name === undefined ? product.name : toName(mergeEntries(product.name, patch.name));
    const nameFault = missingEntries("name", name);
    if (nameFault !== null) {
      throw nameFault;
    }
    let description: LocalizedDescription | null = product.description;
    if (patch.description === null) {
      description = null;
    } else if (patch.description !== undefined) {
      const merged = mergeEntries(product.description ?? { tr: null, en: null }, patch.description);
      const kept = (["tr", "en"] as const).filter((language) => (merged[language]?.trim() ?? "") !== "");
      description = kept.length === 0 ? null : toDescription(merged);
      const descriptionFault = description === null ? null : missingEntries("description", description);
      if (descriptionFault !== null) {
        throw descriptionFault;
      }
    }

    const internalCode = patch.internalCode ?? product.internalCode;
    const regulatoryStatus = patch.regulatoryStatus ?? product.regulatoryStatus;
    const kitCodeBase = patch.kitCodeBase === undefined ? product.kitCodeBase : patch.kitCodeBase;

    const identityChanged = internalCode !== product.internalCode || regulatoryStatus !== product.regulatoryStatus;
    if (identityChanged) {
      // CAT-10 rule 3: the stem and the status change only while the product has
      // no LOT and no document. The check of the documents is the trigger
      // `product_identity_is_settled` (DEC-096): the catalog module does not
      // import the eifu module, and the write below maps its refusal (CAT-10.AC4).
      const catalogNumbers = await listCatalogNumbersOfProducts(tx, [product.id]);
      if (
        (await countLotsOfCatalogNumbers(
          tx,
          catalogNumbers.map((row) => row.id),
        )) > 0
      ) {
        throw lockedByLot();
      }
      const holder = await findProductByIdentity(tx, internalCode, regulatoryStatus);
      if (holder !== null && holder.id !== product.id) {
        throw duplicateIdentity();
      }
    }

    const changed: ProductRow = { ...product, internalCode, name, description, regulatoryStatus, kitCodeBase };
    const before = auditState(product);
    const after = auditState(changed);
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return detailOf(tx, product);
    }
    const at = now();
    try {
      await updateProductRow(tx, product.id, { internalCode, name, description, regulatoryStatus, kitCodeBase, now: at });
    } catch (error) {
      throw violatedConstraint(error) === SETTLED_BY_DOCUMENT_RULE ? lockedByDocument() : error;
    }
    await recordAudit(tx, actor, {
      actionCode: "catalog.product.changed",
      entityType: "catalog_product",
      entityId: String(product.id),
      stateBefore: before,
      stateAfter: after,
    });
    return detailOf(tx, { ...changed, updatedAt: at });
  });
}

/**
 * Deactivates a product. The row stays and the product leaves the choice lists
 * (CAT-10.AC5, DEC-010). The deactivation has one audit row.
 *
 * @throws AppError `PERM-4150` without `catalog.product.manage`; `RES-4200`;
 * `RES-4302` when the product is inactive.
 */
export async function deactivateProduct(actor: SessionActor, id: string): Promise<ProductDetail> {
  requirePermission(actor, "catalog.product.manage");
  return runTransaction(async (tx) => {
    const product = await requireProduct(tx, id, "update");
    if (!product.isActive) {
      throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the product is inactive" });
    }
    const at = now();
    await markProductInactive(tx, product.id, at);
    await recordAudit(tx, actor, {
      actionCode: "catalog.product.deactivated",
      entityType: "catalog_product",
      entityId: String(product.id),
      stateBefore: { isActive: true },
      stateAfter: { isActive: false },
    });
    return detailOf(tx, { ...product, isActive: false, updatedAt: at });
  });
}
