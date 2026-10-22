/**
 * The DTOs of the e-IFU services: what an answer shows, never a record
 * (`sds-nextjs-backend` §3). The routes, the actions and the pages share them.
 * The mappers read the rows of the repositories, and the storage key never
 * leaves them. The helpers here are the ones that more than one service needs:
 * the errors, the product and LOT reads through the catalog service (DEC-004),
 * the audit row, the check of a blank text, and the loads of the parts of a
 * version.
 */
import "server-only";

import type { SessionActor } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS, type JsonValue } from "@/lib/errors";
import { type FieldFault, validationError } from "@/lib/http/validation";
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
import type { Executor, Transaction } from "@/lib/transaction";
import { findLotRef, findLotRefs, findProductRef, findProductRefs } from "@/modules/catalog/services/catalog-reads";
import { appendAudit } from "@/modules/platform/services/audit-service";

import { businessDateOf, periodContains } from "../domain/periods";
import { type DocumentRow, findDocumentById, findDocumentsByIds } from "../repositories/document-repository";
import { type FileRow, type ReplacementRow, listFilesOfVersions, listReplacementsOfVersions } from "../repositories/file-repository";
import { type OverrideRow } from "../repositories/override-repository";
import { type PeriodRow, listPeriodsOfVersions } from "../repositories/applicability-repository";
import { type VersionRow, findVersionsByIds, listVersionsOfDocuments } from "../repositories/version-repository";

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

/** The `bigint` key of a text id, or `null` for an id of a wrong form (a malformed id names no record). */
export function parseEifuId(id: string): bigint | null {
  return EntityId.safeParse(id).success ? BigInt(id) : null;
}

/** The `bigint` key of a text id that a service reads for a record that must exist. @throws AppError `RES-4200`. */
export function requireEifuKey(id: string): bigint {
  const key = parseEifuId(id);
  if (key === null) {
    throw notFound();
  }
  return key;
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

/** The product through the catalog service, or `null` when no product has the id. */
export async function resolveProduct(actor: SessionActor, productId: string): Promise<ProductRef | null> {
  return findProductRef(actor, productId);
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
  if (unique.some((id) => !found.has(id))) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a document has no product" });
  }
  return found;
}

/** The LOT through the catalog service, or `null` when no LOT has the id. */
export async function resolveLot(actor: SessionActor, lotId: string): Promise<LotRef | null> {
  return findLotRef(actor, lotId);
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
  readonly stateBefore: { readonly [key: string]: JsonValue } | null;
  readonly stateAfter: { readonly [key: string]: JsonValue } | null;
  readonly reason?: string;
}

/**
 * Writes one audit row for the actor, inside `tx`, so that the row and the change
 * commit or roll back together (PLT-40.AC1, AC2). The state holds ids, flags and
 * dates, never a secret.
 *
 * @throws AppError The failure of the store. The change then rolls back.
 */
export async function recordAudit(tx: Transaction, actor: SessionActor, entry: EifuAuditEntry): Promise<void> {
  await appendAudit(tx, {
    actor: { type: "USER", userId: actor.userId },
    actionCode: entry.actionCode,
    entityType: entry.entityType,
    entityId: entry.entityId,
    stateBefore: entry.stateBefore,
    stateAfter: entry.stateAfter,
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  });
}

// --------------------------------------------------------------- mappers

const instantOf = (date: Date | null): string | null => (date === null ? null : date.toISOString());

export function toPeriodView(period: PeriodRow): PeriodView {
  return {
    id: String(period.id),
    documentVersionId: String(period.documentVersionId),
    productId: String(period.productId),
    effectiveFrom: period.effectiveFrom,
    effectiveTo: period.effectiveTo,
    withdrawnAt: instantOf(period.withdrawnAt),
  };
}

export function toFileView(file: FileRow): FileView {
  return {
    id: String(file.id),
    documentVersionId: String(file.documentVersionId),
    languageCode: file.languageCode,
    fileHash: file.fileHash,
    fileSizeBytes: file.fileSizeBytes,
    contentType: file.contentType,
    originalFilename: file.originalFilename,
    isActive: file.isActive,
    createdAt: file.createdAt.toISOString(),
  };
}

export function toReplacementView(replacement: ReplacementRow): ReplacementView {
  return {
    id: String(replacement.id),
    documentVersionId: String(replacement.documentVersionId),
    languageCode: replacement.languageCode,
    previousFileId: String(replacement.previousFileId),
    replacementFileId: String(replacement.replacementFileId),
    previousFileHash: replacement.previousFileHash,
    replacementFileHash: replacement.replacementFileHash,
    replacedByUserId: String(replacement.replacedByUserId),
    replacedAt: replacement.replacedAt.toISOString(),
    reason: replacement.reason,
  };
}

/** The periods and the files of some versions, loaded together: three reads serve any number of versions. */
export interface VersionParts {
  /** The period of each version. A `DRAFT` has none. */
  readonly periodOf: ReadonlyMap<bigint, PeriodRow>;
  readonly filesOf: ReadonlyMap<bigint, readonly FileRow[]>;
}

export async function loadVersionParts(executor: Executor, versions: readonly VersionRow[]): Promise<VersionParts> {
  const ids = versions.map((version) => version.id);
  const [periods, files] = await Promise.all([listPeriodsOfVersions(executor, ids), listFilesOfVersions(executor, ids)]);
  const filesOf = new Map<bigint, FileRow[]>();
  for (const file of files) {
    filesOf.set(file.documentVersionId, [...(filesOf.get(file.documentVersionId) ?? []), file]);
  }
  return { periodOf: new Map(periods.map((period) => [period.documentVersionId, period])), filesOf };
}

export function toVersionSummary(version: VersionRow, parts: VersionParts): VersionSummary {
  const period = parts.periodOf.get(version.id);
  return {
    id: String(version.id),
    documentId: String(version.documentId),
    revision: version.revision,
    status: version.status,
    proposedEffectiveFrom: version.proposedEffectiveFrom,
    period: period === undefined ? null : toPeriodView(period),
    fileCount: (parts.filesOf.get(version.id) ?? []).filter((file) => file.isActive).length,
    publishedAt: instantOf(version.publishedAt),
    supersededAt: instantOf(version.supersededAt),
    withdrawnAt: instantOf(version.withdrawnAt),
    createdAt: version.createdAt.toISOString(),
  };
}

/** The version of the document whose live period contains the business date, or `null` (DEC-061, DEC-062). */
function versionInForce(versions: readonly VersionRow[], parts: VersionParts, today: string): VersionInForce | null {
  for (const version of versions) {
    const period = parts.periodOf.get(version.id);
    if (period !== undefined && period.withdrawnAt === null && periodContains(period, today)) {
      return { versionId: String(version.id), revision: version.revision, status: version.status, effectiveFrom: period.effectiveFrom };
    }
  }
  return null;
}

/** The summary of a document, from its versions (in the order of the ids) and their parts. */
export function toDocumentSummary(document: DocumentRow, product: ProductRef, versions: readonly VersionRow[], parts: VersionParts): DocumentSummary {
  return {
    id: String(document.id),
    documentNumber: document.documentNumber,
    documentType: "IFU",
    title: document.title,
    product,
    versionInForce: versionInForce(versions, parts, businessDateOf(now())),
    versionCount: versions.length,
    createdAt: document.createdAt.toISOString(),
  };
}

/** The page of a document, with its versions and their periods. */
export async function loadDocumentDetail(actor: SessionActor, executor: Executor, document: DocumentRow): Promise<DocumentDetail> {
  const product = await requireStoredProduct(actor, String(document.productId));
  const versions = await listVersionsOfDocuments(executor, [document.id]);
  const parts = await loadVersionParts(executor, versions);
  return {
    ...toDocumentSummary(document, product, versions, parts),
    productChangeAllowed: !versions.some((version) => version.publishedAt !== null),
    versions: versions.map((version) => toVersionSummary(version, parts)),
    updatedAt: document.updatedAt.toISOString(),
  };
}

/** The version page with its product (the one of its document), its files and its replacements. */
export async function loadVersionDetail(actor: SessionActor, executor: Executor, version: VersionRow): Promise<VersionDetail> {
  const document = await findDocumentById(executor, version.documentId);
  if (document === null) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a version has no document" });
  }
  const product = await requireStoredProduct(actor, String(document.productId));
  const parts = await loadVersionParts(executor, [version]);
  const replacements = await listReplacementsOfVersions(executor, [version.id]);
  return {
    ...toVersionSummary(version, parts),
    documentNumber: document.documentNumber,
    documentTitle: document.title,
    product,
    publishedByUserId: version.publishedByUserId === null ? null : String(version.publishedByUserId),
    withdrawnByUserId: version.withdrawnByUserId === null ? null : String(version.withdrawnByUserId),
    withdrawalReason: version.withdrawalReason,
    files: (parts.filesOf.get(version.id) ?? []).map(toFileView),
    replacements: replacements.map(toReplacementView),
    updatedAt: version.updatedAt.toISOString(),
  };
}

/** The views of some overrides, in the order given: one read of the versions, of the documents and of the LOTs serves any number. */
export async function loadOverrideViews(actor: SessionActor, executor: Executor, overrides: readonly OverrideRow[]): Promise<LotOverrideView[]> {
  if (overrides.length === 0) {
    return [];
  }
  const versions = await findVersionsByIds(executor, [...new Set(overrides.map((override) => override.documentVersionId))]);
  const documents = await findDocumentsByIds(executor, [...new Set(versions.map((version) => version.documentId))]);
  const lots = await findLotRefs(actor, [...new Set(overrides.map((override) => String(override.lotId)))]);
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const documentById = new Map(documents.map((document) => [document.id, document]));
  return overrides.map((override) => {
    const version = versionById.get(override.documentVersionId);
    const document = version === undefined ? undefined : documentById.get(version.documentId);
    const lot = lots.get(String(override.lotId));
    // `restrict` on delete keeps the three records, so a gap is a broken store.
    if (version === undefined || document === undefined || lot === undefined) {
      throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "an override has no LOT or no version" });
    }
    return {
      id: String(override.id),
      lotId: String(override.lotId),
      lotNumber: lot.lotNumber,
      catalogNumber: lot.catalogNumber,
      productId: lot.productId,
      documentVersionId: String(version.id),
      documentId: String(document.id),
      documentNumber: document.documentNumber,
      revision: version.revision,
      versionStatus: version.status,
      reason: override.reason,
      createdByUserId: String(override.createdByUserId),
      createdAt: override.createdAt.toISOString(),
      isActive: override.isActive,
      endedByUserId: override.endedByUserId === null ? null : String(override.endedByUserId),
      endedAt: instantOf(override.endedAt),
      endReason: override.endReason,
    };
  });
}
