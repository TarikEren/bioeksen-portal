/**
 * The DTOs of the e-IFU services: what an answer shows, never a record
 * (`sds-nextjs-backend` §3). The routes, the actions and the pages share them.
 * The mappers read the rows of the store, and the storage key never leaves them.
 * The helpers here are the ones that more than one service needs: the not-found
 * error, the product and LOT reads through the catalog service (DEC-004), the
 * audit row, and the check of a blank text.
 *
 * MOCK: IFU-20, IFU-30, IFU-31, IFU-32. The bridge of the file service and the
 * publication service, which stay on the mock store until the commit that moves
 * them to the database. The document service and the override service use
 * `eifu-views.ts`. This file goes with that commit.
 */
import "server-only";

import type { SessionActor } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { type FieldFault, validationError } from "@/lib/http/validation";
import {
  type MockDocument,
  type MockFile,
  type MockOverride,
  type MockPeriod,
  type MockReplacement,
  type MockVersion,
  MOCK_LOTS,
  MOCK_PRODUCTS,
  appendMockAudit,
  getEifuMock,
} from "@/lib/mock/eifu";
import type { LotRef, Paging, ProductRef } from "@/lib/schemas/catalog";
import {
  type DocumentDetail,
  type DocumentSummary,
  type FileView,
  type LotOverrideView,
  type PeriodView,
  type ReplacementView,
  type VersionDetail,
  type VersionInForce,
  type VersionSummary,
} from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { findLotRef, findProductRef, findProductRefs } from "@/modules/catalog/services/catalog-reads";

import { businessDateOf, periodContains } from "../domain/periods";

/** 404 `RES-4200`. The answer does not tell a missing record from a record that the caller may not see. */
export function notFound(): AppError {
  return new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
}

/** 409 `RES-4302` with the rule in the log record. */
export function notAllowedInState(reason: string): AppError {
  return new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason });
}

/** 409 `RES-4300` with the rule in the log record. */
export function alreadyExists(reason: string): AppError {
  return new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason });
}

/** An id of a wrong form names no record. @throws AppError `RES-4200`. */
export function requireEifuId(id: string): string {
  if (!EntityId.safeParse(id).success) {
    throw notFound();
  }
  return id;
}

/** One page of an ordered list, and the size of the whole list. A page beyond the last is empty (`sds-api-design`, **Lists**). */
export function pageOf<T>(items: readonly T[], paging: Paging): { readonly slice: T[]; readonly totalCount: number } {
  const start = (paging.page - 1) * paging.limit;
  return { slice: items.slice(start, start + paging.limit), totalCount: items.length };
}

/** 400 `VAL-4001` when the text is blank: a blank text is an absent text (IFU-31.AC4, IFU-32.AC3, IFU-40.AC5, AC7). */
export function requireReason(reason: string, field: string = "reason"): string {
  const trimmed = reason.trim();
  if (trimmed === "") {
    throw validationError([{ code: "VAL-4001", entry: { field, issue: "is required" } }]);
  }
  return trimmed;
}

/** The faults of a localized text with a blank entry (IFU-10 rule 1, DEC-011). */
export function blankTitleFaults(title: Readonly<Record<"tr" | "en", string>>): FieldFault[] {
  return (["tr", "en"] as const)
    .filter((language) => title[language].trim() === "")
    .map((language) => ({ code: "VAL-4001", entry: { field: `title.${language}`, issue: "is required" } }));
}

// ------------------------------------------------------- catalog reads

/** The product through the catalog service. The seed of the mock names product 1 for a database that has none. */
export async function resolveProduct(actor: SessionActor, productId: string): Promise<ProductRef | null> {
  // MOCK: IFU-10 (the seed product)
  return (await findProductRef(actor, productId)) ?? MOCK_PRODUCTS.get(productId) ?? null;
}

/** A product that a stored record names. A gap is a broken store. @throws AppError `DB-5000`. */
export async function requireStoredProduct(actor: SessionActor, productId: string): Promise<ProductRef> {
  const product = await resolveProduct(actor, productId);
  if (product === null) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a document has no product" });
  }
  return product;
}

/** The products of the ids, by id. @throws AppError `DB-5000`. */
export async function requireStoredProducts(actor: SessionActor, productIds: readonly string[]): Promise<Map<string, ProductRef>> {
  const unique = [...new Set(productIds)];
  const found = await findProductRefs(actor, unique);
  // MOCK: IFU-10 (the seed product)
  for (const id of unique) {
    const fallback = MOCK_PRODUCTS.get(id);
    if (!found.has(id) && fallback !== undefined) {
      found.set(id, fallback);
    }
  }
  if (unique.some((id) => !found.has(id))) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a document has no product" });
  }
  return found;
}

/** The LOT through the catalog service. The seed of the mock names LOT 1 for a database that has none. */
export async function resolveLot(actor: SessionActor, lotId: string): Promise<LotRef | null> {
  // MOCK: IFU-40 (the seed LOT)
  return (await findLotRef(actor, lotId)) ?? MOCK_LOTS.get(lotId) ?? null;
}

// ------------------------------------------------------------ the audit

/** The audit actions of the e-IFU module (PLT-40). */
export type EifuAuditAction =
  | "eifu.document.created"
  | "eifu.document.changed"
  | "eifu.document_version.created"
  | "eifu.document_version.changed"
  | "eifu.document_file.uploaded"
  | "eifu.document_file.deactivated"
  | "eifu.document_version.published"
  | "eifu.document_version.withdrawn"
  | "eifu.document_file.replaced"
  | "eifu.lot_override.created"
  | "eifu.lot_override.ended";

export interface EifuAuditEntry {
  readonly actionCode: EifuAuditAction;
  readonly entityType: "eifu_document" | "eifu_document_version" | "eifu_document_file" | "eifu_lot_override";
  readonly entityId: string;
  readonly stateBefore: Readonly<Record<string, unknown>> | null;
  readonly stateAfter: Readonly<Record<string, unknown>> | null;
  readonly reason?: string;
}

/** Writes one audit row for the actor. The state holds ids, flags and dates, never a secret. */
export function recordAudit(actor: SessionActor, entry: EifuAuditEntry): void {
  // MOCK: PLT-40 (appendAudit inside the transaction of the change)
  appendMockAudit(
    {
      actorUserId: actor.userId,
      actionCode: entry.actionCode,
      entityType: entry.entityType,
      entityId: entry.entityId,
      stateBefore: entry.stateBefore,
      stateAfter: entry.stateAfter,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
    },
    now(),
  );
}

// ------------------------------------------------------------- finders

/** The document with the id. @throws AppError `RES-4200`. */
export function requireDocument(id: string): MockDocument {
  const document = getEifuMock().documents.get(requireEifuId(id));
  if (document === undefined) {
    throw notFound();
  }
  return document;
}

/** The version with the id. @throws AppError `RES-4200`. */
export function requireVersion(id: string): MockVersion {
  const version = getEifuMock().versions.get(requireEifuId(id));
  if (version === undefined) {
    throw notFound();
  }
  return version;
}

/** The document of a version. A version always has one: a gap is a broken store. @throws AppError `DB-5000`. */
export function documentOfVersion(version: MockVersion): MockDocument {
  const document = getEifuMock().documents.get(version.documentId);
  if (document === undefined) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a version has no document" });
  }
  return document;
}

/** The file with the id. @throws AppError `RES-4200`. */
export function requireFile(id: string): MockFile {
  const file = getEifuMock().files.get(requireEifuId(id));
  if (file === undefined) {
    throw notFound();
  }
  return file;
}

export function versionsOfDocument(documentId: string): MockVersion[] {
  return [...getEifuMock().versions.values()]
    .filter((version) => version.documentId === documentId)
    .sort((left, right) => Number(left.id) - Number(right.id));
}

export function filesOfVersion(versionId: string): MockFile[] {
  return [...getEifuMock().files.values()]
    .filter((file) => file.versionId === versionId)
    .sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.languageCode.localeCompare(right.languageCode) ||
        Number(left.id) - Number(right.id),
    );
}

/** The period of a version. A `DRAFT` has none. */
export function periodOfVersion(versionId: string): MockPeriod | null {
  return [...getEifuMock().periods.values()].find((period) => period.versionId === versionId) ?? null;
}

/** The live periods of a product: the periods that no withdrawal marked (IFU-30 rule 3, step 4). */
export function livePeriodsOfProduct(productId: string): MockPeriod[] {
  return [...getEifuMock().periods.values()].filter((period) => period.productId === productId && period.withdrawnAt === null);
}

export function replacementsOfVersion(versionId: string): MockReplacement[] {
  return [...getEifuMock().replacements.values()]
    .filter((replacement) => replacement.versionId === versionId)
    .sort((left, right) => Number(right.id) - Number(left.id));
}

// --------------------------------------------------------------- mappers

export function toPeriodView(period: MockPeriod): PeriodView {
  return {
    id: period.id,
    documentVersionId: period.versionId,
    productId: period.productId,
    effectiveFrom: period.effectiveFrom,
    effectiveTo: period.effectiveTo,
    withdrawnAt: period.withdrawnAt === null ? null : period.withdrawnAt.toISOString(),
  };
}

export function toFileView(file: MockFile): FileView {
  return {
    id: file.id,
    documentVersionId: file.versionId,
    languageCode: file.languageCode,
    fileHash: file.fileHash,
    fileSizeBytes: file.fileSizeBytes,
    contentType: file.contentType,
    originalFilename: file.originalFilename,
    isActive: file.isActive,
    createdAt: file.createdAt.toISOString(),
  };
}

export function toReplacementView(replacement: MockReplacement): ReplacementView {
  return {
    id: replacement.id,
    documentVersionId: replacement.versionId,
    languageCode: replacement.languageCode,
    previousFileId: replacement.previousFileId,
    replacementFileId: replacement.replacementFileId,
    previousFileHash: replacement.previousFileHash,
    replacementFileHash: replacement.replacementFileHash,
    replacedByUserId: replacement.replacedByUserId,
    replacedAt: replacement.replacedAt.toISOString(),
    reason: replacement.reason,
  };
}

export function toVersionSummary(version: MockVersion): VersionSummary {
  const period = periodOfVersion(version.id);
  return {
    id: version.id,
    documentId: version.documentId,
    revision: version.revision,
    status: version.status,
    proposedEffectiveFrom: version.proposedEffectiveFrom,
    period: period === null ? null : toPeriodView(period),
    fileCount: filesOfVersion(version.id).filter((file) => file.isActive).length,
    publishedAt: version.publishedAt === null ? null : version.publishedAt.toISOString(),
    supersededAt: version.supersededAt === null ? null : version.supersededAt.toISOString(),
    withdrawnAt: version.withdrawnAt === null ? null : version.withdrawnAt.toISOString(),
    createdAt: version.createdAt.toISOString(),
  };
}

/** The version of the document whose live period contains the business date, or `null` (DEC-061, DEC-062). */
function versionInForce(documentId: string, today: string): VersionInForce | null {
  for (const version of versionsOfDocument(documentId)) {
    const period = periodOfVersion(version.id);
    if (period !== null && period.withdrawnAt === null && periodContains(period, today)) {
      return { versionId: version.id, revision: version.revision, status: version.status, effectiveFrom: period.effectiveFrom };
    }
  }
  return null;
}

export function toDocumentSummary(document: MockDocument, product: ProductRef): DocumentSummary {
  return {
    id: document.id,
    documentNumber: document.documentNumber,
    documentType: "IFU",
    title: document.title,
    product,
    versionInForce: versionInForce(document.id, businessDateOf(now())),
    versionCount: versionsOfDocument(document.id).length,
    createdAt: document.createdAt.toISOString(),
  };
}

/** Whether a version of the document was published: the product no longer changes (IFU-10 rule 2). */
export function hasPublishedVersion(documentId: string): boolean {
  return versionsOfDocument(documentId).some((version) => version.publishedAt !== null);
}

export function toDocumentDetail(document: MockDocument, product: ProductRef): DocumentDetail {
  return {
    ...toDocumentSummary(document, product),
    productChangeAllowed: !hasPublishedVersion(document.id),
    versions: versionsOfDocument(document.id).map(toVersionSummary),
    updatedAt: document.updatedAt.toISOString(),
  };
}

/** The version page with its product (the one of its document), its files and its replacements. */
export async function toVersionDetail(actor: SessionActor, version: MockVersion): Promise<VersionDetail> {
  const document = documentOfVersion(version);
  const product = await requireStoredProduct(actor, document.productId);
  return {
    ...toVersionSummary(version),
    documentNumber: document.documentNumber,
    documentTitle: document.title,
    product,
    publishedByUserId: version.publishedByUserId,
    withdrawnByUserId: version.withdrawnByUserId,
    withdrawalReason: version.withdrawalReason,
    files: filesOfVersion(version.id).map(toFileView),
    replacements: replacementsOfVersion(version.id).map(toReplacementView),
    updatedAt: version.updatedAt.toISOString(),
  };
}

/** One override with its LOT and its target version. */
export function toOverrideView(override: MockOverride, lot: LotRef): LotOverrideView {
  const version = requireVersion(override.versionId);
  const document = documentOfVersion(version);
  return {
    id: override.id,
    lotId: override.lotId,
    lotNumber: lot.lotNumber,
    catalogNumber: lot.catalogNumber,
    productId: lot.productId,
    documentVersionId: version.id,
    documentId: document.id,
    documentNumber: document.documentNumber,
    revision: version.revision,
    versionStatus: version.status,
    reason: override.reason,
    createdByUserId: override.createdByUserId,
    createdAt: override.createdAt.toISOString(),
    isActive: override.isActive,
    endedByUserId: override.endedByUserId,
    endedAt: override.endedAt === null ? null : override.endedAt.toISOString(),
    endReason: override.endReason,
  };
}
