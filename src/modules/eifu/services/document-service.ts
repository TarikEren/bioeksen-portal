/**
 * Documents and their versions (IFU-10).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * runs in one transaction with its audit row (PLT-40). The system never deletes
 * a document or a version (DEC-010). A product or a LOT is read only through a
 * catalog service (DEC-004).
 *
 * The lock of the stem and the status of a product (IFU-10 rule 5) is the
 * trigger `product_identity_is_settled` of the migration `eifu_documents`
 * (DEC-096), and the catalog service maps its refusal. The lock of the product
 * of a document (IFU-10 rule 2) is the trigger `document_product_is_settled`.
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { validationError } from "@/lib/http/validation";
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
import { readExecutor, runTransaction, violatedConstraint } from "@/lib/transaction";

import {
  findDocumentById,
  insertDocument,
  listDocumentRows,
  updateDocumentRow,
} from "../repositories/document-repository";
import {
  findVersionById,
  hasPublishedVersion,
  insertVersion,
  listVersionsOfDocuments,
  updateProposedEffectiveFrom,
} from "../repositories/version-repository";
import {
  alreadyExists,
  blankTitleFaults,
  loadDocumentDetail,
  loadVersionDetail,
  loadVersionParts,
  notAllowedInState,
  notFound,
  pageOf,
  parseEifuId,
  recordAudit,
  requireEifuKey,
  requireStoredProducts,
  resolveProduct,
  toDocumentSummary,
} from "./eifu-views";

/** The constraint and the trigger rules that the database names for the refusals of this file. */
const DOCUMENT_NUMBER_RULE = "document_number_unique";
const REVISION_RULE = "document_version_unique_revision";
const PRODUCT_SETTLED_RULE = "document_product_is_settled";

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
  const executor = readExecutor();
  const needle = query.q === null ? null : query.q.toLocaleLowerCase("tr");
  const productKey = query.productId === null ? null : parseEifuId(query.productId);
  if (query.productId !== null && productKey === null) {
    // An id of a wrong form names no product, so no document names it.
    return { page: query.page, count: 0, totalCount: 0, documents: [], filterParams: query };
  }
  const matching = (await listDocumentRows(executor, productKey)).filter(
    (document) => needle === null || matchesText(document.documentNumber, document.title, needle),
  );
  const { slice, totalCount } = pageOf(matching, query);
  const products = await requireStoredProducts(
    actor,
    slice.map((document) => String(document.productId)),
  );
  const versions = await listVersionsOfDocuments(
    executor,
    slice.map((document) => document.id),
  );
  const parts = await loadVersionParts(executor, versions);
  const documents = slice.map((document) => {
    const product = products.get(String(document.productId));
    if (product === undefined) {
      throw new Error("The product of a listed document is missing after the check");
    }
    return toDocumentSummary(
      document,
      product,
      versions.filter((version) => version.documentId === document.id),
      parts,
    );
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
  return runTransaction(async (tx) => {
    // The number is checked by the constraint, so two creations at once give one winner.
    let document;
    try {
      document = await insertDocument(tx, {
        documentNumber: input.documentNumber.trim(),
        title: { tr: input.title.tr.trim(), en: input.title.en.trim() },
        productId: BigInt(product.id),
        now: now(),
      });
    } catch (error) {
      throw violatedConstraint(error) === DOCUMENT_NUMBER_RULE ? alreadyExists("a document has the document number") : error;
    }
    await recordAudit(tx, actor, {
      actionCode: "eifu.document.created",
      entityType: "eifu_document",
      entityId: String(document.id),
      stateBefore: null,
      stateAfter: { documentNumber: document.documentNumber, title: document.title, productId: String(document.productId) },
    });
    return loadDocumentDetail(actor, tx, document);
  });
}

/**
 * One document with its versions, their states and their periods.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200`.
 */
export async function getDocument(actor: SessionActor, id: string): Promise<DocumentDetail> {
  requirePermission(actor, "eifu.document.view");
  const executor = readExecutor();
  const document = await findDocumentById(executor, requireEifuKey(id));
  if (document === null) {
    throw notFound();
  }
  return loadDocumentDetail(actor, executor, document);
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
  const key = requireEifuKey(id);
  return runTransaction(async (tx) => {
    // A publication locks the same row first, so a publication and a change of the product run one after the other.
    const document = await findDocumentById(tx, key, "no-key-update");
    if (document === null) {
      throw notFound();
    }
    const title = {
      tr: (patch.title?.tr ?? document.title.tr).trim(),
      en: (patch.title?.en ?? document.title.en).trim(),
    };
    const titleFaults = blankTitleFaults(title);
    if (titleFaults.length > 0) {
      throw validationError(titleFaults);
    }
    const productId = patch.productId === undefined ? document.productId : BigInt(patch.productId);
    if (productId !== document.productId) {
      // IFU-10 rule 2: the product changes only until the first publication. The trigger `document_product_is_settled` holds the rule in the database.
      if (await hasPublishedVersion(tx, document.id)) {
        throw notAllowedInState("the product of a document with a published version");
      }
      if ((await resolveProduct(actor, String(productId))) === null) {
        throw validationError([{ code: "VAL-4006", entry: { field: "productId", issue: EIFU_ISSUES.productNotFound } }]);
      }
    }
    const before = { title: document.title, productId: String(document.productId) };
    const after = { title, productId: String(productId) };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const at = now();
      try {
        await updateDocumentRow(tx, document.id, { title, productId, now: at });
      } catch (error) {
        throw violatedConstraint(error) === PRODUCT_SETTLED_RULE
          ? notAllowedInState("the product of a document with a published version")
          : error;
      }
      await recordAudit(tx, actor, {
        actionCode: "eifu.document.changed",
        entityType: "eifu_document",
        entityId: String(document.id),
        stateBefore: before,
        stateAfter: after,
      });
      return loadDocumentDetail(actor, tx, { ...document, title, productId, updatedAt: at });
    }
    return loadDocumentDetail(actor, tx, document);
  });
}

/**
 * Creates a version as `DRAFT` (IFU-10.AC3). The creation has one audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `RES-4200`;
 * `RES-4300` when the document has the revision label.
 */
export async function createVersion(actor: SessionActor, documentId: string, input: CreateVersionInput): Promise<VersionDetail> {
  requirePermission(actor, "eifu.document.manage");
  const key = requireEifuKey(documentId);
  return runTransaction(async (tx) => {
    const document = await findDocumentById(tx, key);
    if (document === null) {
      throw notFound();
    }
    let version;
    try {
      version = await insertVersion(tx, {
        documentId: document.id,
        revision: input.revision.trim(),
        proposedEffectiveFrom: input.proposedEffectiveFrom ?? null,
        now: now(),
      });
    } catch (error) {
      throw violatedConstraint(error) === REVISION_RULE ? alreadyExists("the document has the revision label") : error;
    }
    await recordAudit(tx, actor, {
      actionCode: "eifu.document_version.created",
      entityType: "eifu_document_version",
      entityId: String(version.id),
      stateBefore: null,
      stateAfter: {
        documentId: String(document.id),
        revision: version.revision,
        status: version.status,
        proposedEffectiveFrom: version.proposedEffectiveFrom,
      },
    });
    return loadVersionDetail(actor, tx, version);
  });
}

/**
 * One version with its files, its period and its replacements.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200`.
 */
export async function getVersion(actor: SessionActor, id: string): Promise<VersionDetail> {
  requirePermission(actor, "eifu.document.view");
  const executor = readExecutor();
  const version = await findVersionById(executor, requireEifuKey(id));
  if (version === null) {
    throw notFound();
  }
  return loadVersionDetail(actor, executor, version);
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
  const key = requireEifuKey(id);
  return runTransaction(async (tx) => {
    // The row stays locked until the commit, so a publication cannot slip in between the check and the write.
    const version = await findVersionById(tx, key, "no-key-update");
    if (version === null) {
      throw notFound();
    }
    if (patch.proposedEffectiveFrom === undefined) {
      return loadVersionDetail(actor, tx, version);
    }
    if (version.status !== "DRAFT") {
      throw notAllowedInState("a field of a version that is not a draft");
    }
    if (patch.proposedEffectiveFrom === version.proposedEffectiveFrom) {
      return loadVersionDetail(actor, tx, version);
    }
    const at = now();
    await updateProposedEffectiveFrom(tx, version.id, patch.proposedEffectiveFrom, at);
    await recordAudit(tx, actor, {
      actionCode: "eifu.document_version.changed",
      entityType: "eifu_document_version",
      entityId: String(version.id),
      stateBefore: { proposedEffectiveFrom: version.proposedEffectiveFrom },
      stateAfter: { proposedEffectiveFrom: patch.proposedEffectiveFrom },
    });
    return loadVersionDetail(actor, tx, { ...version, proposedEffectiveFrom: patch.proposedEffectiveFrom, updatedAt: at });
  });
}
