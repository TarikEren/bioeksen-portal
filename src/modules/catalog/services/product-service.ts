/**
 * Products (CAT-10).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * writes one audit row (PLT-40). The stem and the regulatory status change only
 * while the product has no LOT (CAT-10 rule 3; the check of the documents comes
 * in B3). The system never deletes a product (DEC-010).
 *
 * MOCK: CAT-10. The functions read and write the mock store. Step 4 moves the
 * work to the repositories and one transaction for each change, with the same
 * signatures.
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { type MockProduct, getCatalogMock } from "@/lib/mock/catalog";
import type {
  CreateProductInput,
  LocalizedDescription,
  LocalizedName,
  ProductDetail,
  ProductListPage,
  ProductListQuery,
  UpdateProductInput,
} from "@/lib/schemas/catalog";

import { recordAudit } from "./catalog-audit";
import {
  byIdAscending,
  catalogNumbersOf,
  lotCountOfProduct,
  notFound,
  pageOf,
  toProductDetail,
  toProductSummary,
} from "./catalog-views";

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

function requireProduct(id: string): MockProduct {
  const product = getCatalogMock().products.get(id);
  if (product === undefined) {
    throw notFound();
  }
  return product;
}

/** The fields of a product that the audit row shows. */
function auditState(product: MockProduct): Record<string, unknown> {
  return {
    internalCode: product.internalCode,
    name: product.name,
    description: product.description,
    regulatoryStatus: product.regulatoryStatus,
    kitCodeBase: product.kitCodeBase,
    isActive: product.isActive,
  };
}

/** Whether another product has the stem and the status (`product_unique_identity`). */
function identityTaken(internalCode: string, status: MockProduct["regulatoryStatus"], exceptId: string | null): boolean {
  return [...getCatalogMock().products.values()].some(
    (candidate) => candidate.id !== exceptId && candidate.internalCode === internalCode && candidate.regulatoryStatus === status,
  );
}

/** Whether the text is in the stem, the name of either language or a catalog number of the product. */
function matchesSearch(product: MockProduct, needle: string): boolean {
  const haystacks = [
    product.internalCode,
    product.name.tr,
    product.name.en,
    ...catalogNumbersOf(product.id).map((candidate) => candidate.catalogNumber),
  ];
  const lowered = needle.toLocaleLowerCase("tr");
  return haystacks.some((text) => text.toLocaleLowerCase("tr").includes(lowered));
}

/**
 * Lists the products, one page, in the order of the stem and the status.
 *
 * @throws AppError `PERM-4150` without `catalog.product.view`.
 */
export async function listProducts(actor: SessionActor, query: ProductListQuery): Promise<ProductListPage> {
  requirePermission(actor, "catalog.product.view");
  // MOCK: CAT-10 (list, search)
  const matching = [...getCatalogMock().products.values()]
    .filter((product) => query.active === null || product.isActive === query.active)
    .filter((product) => query.q === null || matchesSearch(product, query.q))
    .sort(
      (left, right) =>
        left.internalCode.localeCompare(right.internalCode) ||
        left.regulatoryStatus.localeCompare(right.regulatoryStatus) ||
        byIdAscending(left, right),
    );
  const { slice, totalCount } = pageOf(matching, query);
  const products = slice.map(toProductSummary);
  return Promise.resolve({ page: query.page, count: products.length, totalCount, products, filterParams: query });
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
  // MOCK: CAT-10 (create)
  const state = getCatalogMock();
  if (identityTaken(input.internalCode, input.regulatoryStatus, null)) {
    throw duplicateIdentity();
  }
  const created = now();
  const product: MockProduct = {
    id: String(state.nextProductId),
    internalCode: input.internalCode,
    name: { tr: input.name.tr.trim(), en: input.name.en.trim() },
    description:
      input.description === undefined ? null : { tr: input.description.tr.trim(), en: input.description.en.trim() },
    regulatoryStatus: input.regulatoryStatus,
    kitCodeBase: input.kitCodeBase ?? null,
    isActive: true,
    createdAt: created,
    updatedAt: created,
  };
  state.nextProductId += 1;
  state.products.set(product.id, product);
  recordAudit(actor, {
    actionCode: "catalog.product.created",
    entityType: "catalog_product",
    entityId: product.id,
    stateBefore: null,
    stateAfter: auditState(product),
  });
  return toProductDetail(product);
}

/**
 * One product with its catalog numbers.
 *
 * @throws AppError `PERM-4150` without `catalog.product.view`; `RES-4200`.
 */
export async function getProduct(actor: SessionActor, id: string): Promise<ProductDetail> {
  requirePermission(actor, "catalog.product.view");
  // MOCK: CAT-10 (read)
  return Promise.resolve(toProductDetail(requireProduct(id)));
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
  // MOCK: CAT-10 (change)
  const product = requireProduct(id);

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
  if (identityChanged && lotCountOfProduct(product.id) > 0) {
    throw lockedByLot();
  }
  if (identityChanged && identityTaken(internalCode, regulatoryStatus, product.id)) {
    throw duplicateIdentity();
  }

  const before = auditState(product);
  product.internalCode = internalCode;
  product.name = name;
  product.description = description;
  product.regulatoryStatus = regulatoryStatus;
  product.kitCodeBase = kitCodeBase;
  const after = auditState(product);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    product.updatedAt = now();
    recordAudit(actor, {
      actionCode: "catalog.product.changed",
      entityType: "catalog_product",
      entityId: product.id,
      stateBefore: before,
      stateAfter: after,
    });
  }
  return toProductDetail(product);
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
  // MOCK: CAT-10 (deactivate)
  const product = requireProduct(id);
  if (!product.isActive) {
    throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the product is inactive" });
  }
  product.isActive = false;
  product.updatedAt = now();
  recordAudit(actor, {
    actionCode: "catalog.product.deactivated",
    entityType: "catalog_product",
    entityId: product.id,
    stateBefore: { isActive: true },
    stateAfter: { isActive: false },
  });
  return toProductDetail(product);
}
