/**
 * Documents and their versions (IFU-10).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * writes one audit row (PLT-40). The system never deletes a document or a
 * version (DEC-010). A product or a LOT is read only through a catalog service
 * (DEC-004).
 *
 * MOCK: IFU-10. The functions read and write the mock store. Step 4 moves the
 * work to the repositories and one transaction for each change, with the same
 * signatures. The lock of the stem and the status of a product (IFU-10 rule 5)
 * is a trigger of the migration of step 4 (DEC-096).
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { getEifuMock } from "@/lib/mock/eifu";
import {
  type CreateDocumentInput,
  type CreateVersionInput,
  type DocumentDetail,
  type DocumentListPage,
  type DocumentListQuery,
  EIFU_ISSUES,
  type UpdateDocumentInput,
  type UpdateVersionInput,
  type VersionDetail,
} from "@/lib/schemas/eifu";

import {
  alreadyExists,
  blankTitleFaults,
  hasPublishedVersion,
  notAllowedInState,
  pageOf,
  recordAudit,
  requireDocument,
  requireStoredProduct,
  requireStoredProducts,
  requireVersion,
  resolveProduct,
  toDocumentDetail,
  toDocumentSummary,
  toVersionDetail,
  versionsOfDocument,
} from "./eifu-views";

/** Whether the text is in the document number or in the title of either language. */
function matchesText(documentNumber: string, title: Readonly<Record<"tr" | "en", string>>, needle: string): boolean {
  return [documentNumber, title.tr, title.en].some((text) => text.toLocaleLowerCase("tr").includes(needle));
}

/**
 * Lists the documents, one page, in the order of the document number. A row has
 * its product and the version in force today. The search matches the document
 * number and the title in either language.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`.
 */
export async function listDocuments(actor: SessionActor, query: DocumentListQuery): Promise<DocumentListPage> {
  requirePermission(actor, "eifu.document.view");
  // MOCK: IFU-10 (list, search)
  const needle = query.q === null ? null : query.q.toLocaleLowerCase("tr");
  const matching = [...getEifuMock().documents.values()]
    .filter((document) => query.productId === null || document.productId === query.productId)
    .filter((document) => needle === null || matchesText(document.documentNumber, document.title, needle))
    .sort((left, right) => left.documentNumber.localeCompare(right.documentNumber) || Number(left.id) - Number(right.id));
  const { slice, totalCount } = pageOf(matching, query);
  const products = await requireStoredProducts(
    actor,
    slice.map((document) => document.productId),
  );
  const documents = slice.map((document) => {
    const product = products.get(document.productId);
    if (product === undefined) {
      throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a document has no product" });
    }
    return toDocumentSummary(document, product);
  });
  return { page: query.page, count: documents.length, totalCount, documents, filterParams: query };
}

/**
 * Creates a document (IFU-10.AC1). The creation has one audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `VAL-4001` for a
 * blank title entry (DEC-011); `VAL-4006` on `productId` when no product has the
 * id; `RES-4300` when a document has the number (IFU-10.AC2).
 */
export async function createDocument(actor: SessionActor, input: CreateDocumentInput): Promise<DocumentDetail> {
  requirePermission(actor, "eifu.document.manage");
  const titleFaults = blankTitleFaults(input.title);
  if (titleFaults.length > 0) {
    throw validationError(titleFaults);
  }
  const product = await resolveProduct(actor, input.productId);
  if (product === null) {
    throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: EIFU_ISSUES.productNotFound } }]);
  }
  // MOCK: IFU-10 (create)
  const state = getEifuMock();
  const documentNumber = input.documentNumber.trim();
  // A second creation with the same number between this check and the insert
  // fails on `document_number_unique` with the same `RES-4300`.
  if ([...state.documents.values()].some((document) => document.documentNumber === documentNumber)) {
    throw alreadyExists("a document has the document number");
  }
  const created = now();
  const document = {
    id: String(state.nextDocumentId),
    documentNumber,
    title: { tr: input.title.tr.trim(), en: input.title.en.trim() },
    productId: product.id,
    createdAt: created,
    updatedAt: created,
  };
  state.nextDocumentId += 1;
  state.documents.set(document.id, document);
  recordAudit(actor, {
    actionCode: "eifu.document.created",
    entityType: "eifu_document",
    entityId: document.id,
    stateBefore: null,
    stateAfter: { documentNumber, title: document.title, productId: document.productId },
  });
  return toDocumentDetail(document, product);
}

/**
 * One document with its versions, their states and their periods.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200`.
 */
export async function getDocument(actor: SessionActor, id: string): Promise<DocumentDetail> {
  requirePermission(actor, "eifu.document.view");
  // MOCK: IFU-10 (read)
  const document = requireDocument(id);
  return toDocumentDetail(document, await requireStoredProduct(actor, document.productId));
}

/**
 * Changes a document with a JSON Merge Patch (RFC 7396). A patch that changes
 * nothing writes no audit row. The change has one audit row, with the fields
 * before and after.
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `RES-4200`;
 * `VAL-4001` for a blank title entry; `VAL-4006` on `productId` when no product
 * has the id; `RES-4302` for a new product after the first publication of a
 * version (IFU-10.AC4).
 */
export async function updateDocument(actor: SessionActor, id: string, patch: UpdateDocumentInput): Promise<DocumentDetail> {
  requirePermission(actor, "eifu.document.manage");
  // MOCK: IFU-10 (change)
  const document = requireDocument(id);
  const title = {
    tr: (patch.title?.tr ?? document.title.tr).trim(),
    en: (patch.title?.en ?? document.title.en).trim(),
  };
  const titleFaults = blankTitleFaults(title);
  if (titleFaults.length > 0) {
    throw validationError(titleFaults);
  }
  const productId = patch.productId ?? document.productId;
  let product = await requireStoredProduct(actor, document.productId);
  if (productId !== document.productId) {
    // IFU-10 rule 2: the product changes only until the first publication. The trigger `document_product_is_settled` holds the rule in the database.
    if (hasPublishedVersion(document.id)) {
      throw notAllowedInState("the product of a document with a published version");
    }
    const next = await resolveProduct(actor, productId);
    if (next === null) {
      throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: EIFU_ISSUES.productNotFound } }]);
    }
    product = next;
  }
  const before = { title: document.title, productId: document.productId };
  const after = { title, productId };
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    document.title = title;
    document.productId = productId;
    document.updatedAt = now();
    recordAudit(actor, {
      actionCode: "eifu.document.changed",
      entityType: "eifu_document",
      entityId: document.id,
      stateBefore: before,
      stateAfter: after,
    });
  }
  return toDocumentDetail(document, product);
}

/**
 * Creates a version as `DRAFT` (IFU-10.AC3). The creation has one audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `RES-4200`;
 * `RES-4300` when the document has the revision label.
 */
export async function createVersion(actor: SessionActor, documentId: string, input: CreateVersionInput): Promise<VersionDetail> {
  requirePermission(actor, "eifu.document.manage");
  // MOCK: IFU-10 (create a version)
  const state = getEifuMock();
  const document = requireDocument(documentId);
  const revision = input.revision.trim();
  // A second creation with the same label fails on `document_version_unique_revision` with the same `RES-4300`.
  if (versionsOfDocument(document.id).some((version) => version.revision === revision)) {
    throw alreadyExists("the document has the revision label");
  }
  const created = now();
  const version = {
    id: String(state.nextVersionId),
    documentId: document.id,
    revision,
    status: "DRAFT" as const,
    proposedEffectiveFrom: input.proposedEffectiveFrom ?? null,
    publishedAt: null,
    publishedByUserId: null,
    supersededAt: null,
    withdrawnAt: null,
    withdrawnByUserId: null,
    withdrawalReason: null,
    createdAt: created,
    updatedAt: created,
  };
  state.nextVersionId += 1;
  state.versions.set(version.id, version);
  recordAudit(actor, {
    actionCode: "eifu.document_version.created",
    entityType: "eifu_document_version",
    entityId: version.id,
    stateBefore: null,
    stateAfter: { documentId: document.id, revision, status: version.status, proposedEffectiveFrom: version.proposedEffectiveFrom },
  });
  return toVersionDetail(actor, version);
}

/**
 * One version with its files, its period and its replacements.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200`.
 */
export async function getVersion(actor: SessionActor, id: string): Promise<VersionDetail> {
  requirePermission(actor, "eifu.document.view");
  // MOCK: IFU-10 (read a version)
  return toVersionDetail(actor, requireVersion(id));
}

/**
 * Changes a `DRAFT` version with a JSON Merge Patch. A patch that changes nothing
 * writes no audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `RES-4200`;
 * `RES-4302` when the version is not `DRAFT` (IFU-10.AC6).
 */
export async function updateVersion(actor: SessionActor, id: string, patch: UpdateVersionInput): Promise<VersionDetail> {
  requirePermission(actor, "eifu.document.manage");
  // MOCK: IFU-10 (change a version)
  const version = requireVersion(id);
  if (patch.proposedEffectiveFrom !== undefined) {
    if (version.status !== "DRAFT") {
      throw notAllowedInState("a field of a version that is not a draft");
    }
    if (patch.proposedEffectiveFrom !== version.proposedEffectiveFrom) {
      const before = { proposedEffectiveFrom: version.proposedEffectiveFrom };
      version.proposedEffectiveFrom = patch.proposedEffectiveFrom;
      version.updatedAt = now();
      recordAudit(actor, {
        actionCode: "eifu.document_version.changed",
        entityType: "eifu_document_version",
        entityId: version.id,
        stateBefore: before,
        stateAfter: { proposedEffectiveFrom: version.proposedEffectiveFrom },
      });
    }
  }
  return toVersionDetail(actor, version);
}
