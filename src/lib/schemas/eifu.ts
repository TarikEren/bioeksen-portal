/**
 * The schemas and types of the e-IFU document API (stage B3 contract, IFU-10,
 * IFU-20, IFU-30, IFU-31, IFU-32, IFU-40).
 *
 * A zod schema is the one source of its type, as in `catalog.ts`. An id is a
 * string in JSON, because the key is a `bigint` (DEC-009). A business date is
 * `YYYY-MM-DD` (DEC-039); a time is an RFC 3339 text with an offset. A request
 * body is a strict object: an unknown field is 400 `VAL-4007`. A `PATCH` body is
 * a JSON Merge Patch (RFC 7396).
 *
 * A blank text is an absent text: the service answers 400 `VAL-4001` for a blank
 * title entry or `reason` (IFU-31.AC4, IFU-32.AC3, IFU-40.AC5), so the schemas
 * give no minimum length to those fields.
 *
 * This file is pure.
 */
import { z } from "zod";

import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";

import { type Paging, ProductRef, parsePaging } from "./catalog";
import { EntityId } from "./identity";

export const VERSION_STATUSES = ["DRAFT", "PUBLISHED", "SUPERSEDED", "WITHDRAWN"] as const;
export const VersionStatus = z.enum(VERSION_STATUSES);
export type VersionStatus = z.infer<typeof VersionStatus>;

/** The only document type of release 1 (DEC-002, DEC-120). */
export const DOCUMENT_TYPES = ["IFU"] as const;
export const DocumentType = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentType>;

/** The body limit of the two file routes is 20 MiB (IFU-20 rule 2, DEC-092). */
export const FILE_BODY_LIMIT_BYTES = 20_971_520;
/** The content type of every stored document file (IFU-20.AC1). */
export const PDF_CONTENT_TYPE = "application/pdf";

/** The longest values that the columns hold (IFU-10, IFU-20). */
export const DOCUMENT_NUMBER_MAX = 64;
export const REVISION_MAX = 16;
/** A BCP 47 tag has up to 35 characters (DEC-069). */
export const LANGUAGE_CODE_MAX = 35;
const TITLE_MAX = 300;
const REASON_MAX = 500;
const FILENAME_MAX = 255;

const timestamp = z.iso.datetime({ offset: true });
/** A calendar date, `YYYY-MM-DD` (DEC-039). */
const businessDate = z.iso.date();

/**
 * The phrases of the `details` entries that a page must match (review 5, R-071).
 * The services use these values and no other text for the faults below, so a
 * page can pick its message from the field and the phrase. The generic phrases
 * (`is required`, `is not a field of this endpoint`, …) are those of
 * `src/lib/http/validation.ts`.
 */
export const EIFU_ISSUES = {
  /** A blank text that is required (`title.tr`, `reason`). */
  required: "is required",
  /** `file`: the first bytes are not `%PDF-` (IFU-20.AC2). */
  fileNotPdf: "is not a PDF file",
  /** `file`: the file has no bytes (IFU-20.AC8). */
  fileEmpty: "has no bytes",
  /** `file`: the declared SHA-256 differs from the calculated one (IFU-20.AC7). */
  hashDiffers: "has a hash that differs from the declared hash",
  /** `file`: a replacement with the bytes of the file in force (IFU-32.AC2). */
  sameBytes: "has the same bytes as the file in force",
  /** `productId`: no product has the id. */
  productNotFound: "does not name a product",
  /** `languageCode`: not a BCP 47 tag (IFU-20.AC6). */
  languageCodeInvalid: "is not a BCP 47 language tag",
  /** `effectiveFrom`: on or before the start of the open period (IFU-30.AC3). */
  effectiveFromNotAfterOpenPeriod: "must be after the start of the open period",
  /** `effectiveFrom`: before the end of the latest period (IFU-30.AC8). */
  effectiveFromBeforeLatestEnd: "must not be before the end of the latest period",
  /** `documentVersionId`: no version has the id (IFU-40.AC2). */
  versionNotFound: "does not name a version",
  /** `documentVersionId`: the version is a `DRAFT` or `WITHDRAWN` (IFU-40.AC2). */
  versionNotPublished: "must name a PUBLISHED or SUPERSEDED version",
  /** `documentVersionId`: the version is of another product than the LOT (IFU-40.AC3). */
  versionOfOtherProduct: "must name a version of the product of the LOT",
} as const;

export type EifuIssue = (typeof EIFU_ISSUES)[keyof typeof EIFU_ISSUES];

/** A BCP 47 tag, up to 35 characters (DEC-069). The service checks the form (`language-code.ts` of the module). */
export const LanguageCode = z.string().max(LANGUAGE_CODE_MAX);
export type LanguageCode = z.infer<typeof LanguageCode>;

/** The title of a document in both languages (DEC-011). The service checks that each entry is not blank. */
export const DocumentTitle = z.strictObject({ tr: z.string().max(TITLE_MAX), en: z.string().max(TITLE_MAX) });
export type DocumentTitle = z.infer<typeof DocumentTitle>;

// ---------------------------------------------------------------- requests

/** `POST documents` (IFU-10.AC1). */
export const CreateDocumentInput = z.strictObject({
  documentNumber: z.string().trim().min(1).max(DOCUMENT_NUMBER_MAX),
  title: DocumentTitle,
  productId: EntityId,
});
export type CreateDocumentInput = z.infer<typeof CreateDocumentInput>;

/** `PATCH documents/{id}`, a JSON Merge Patch. A member of `title` merges. The product changes only before a publication (IFU-10.AC4). */
export const UpdateDocumentInput = z.strictObject({
  title: z.strictObject({ tr: z.string().max(TITLE_MAX).optional(), en: z.string().max(TITLE_MAX).optional() }).optional(),
  productId: EntityId.optional(),
});
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentInput>;

/** `POST documents/{id}/versions` (IFU-10.AC3). */
export const CreateVersionInput = z.strictObject({
  revision: z.string().trim().min(1).max(REVISION_MAX),
  proposedEffectiveFrom: businessDate.optional(),
});
export type CreateVersionInput = z.infer<typeof CreateVersionInput>;

/** `PATCH document-versions/{id}`, a JSON Merge Patch. `null` removes the proposed start (IFU-10.AC5). */
export const UpdateVersionInput = z.strictObject({
  proposedEffectiveFrom: businessDate.nullable().optional(),
});
export type UpdateVersionInput = z.infer<typeof UpdateVersionInput>;

/** `POST document-versions/{id}/publication` (IFU-30 rule 2). */
export const PublishInput = z.strictObject({
  effectiveFrom: businessDate,
  expectedProductId: EntityId,
});
export type PublishInput = z.infer<typeof PublishInput>;

/** `POST document-versions/{id}/withdrawal` (IFU-31). The service checks that the reason is not blank. */
export const WithdrawInput = z.strictObject({
  reason: z.string().max(REASON_MAX),
  reopenPrevious: z.boolean().optional(),
});
export type WithdrawInput = z.infer<typeof WithdrawInput>;

/** `POST lots/{lotId}/overrides` (IFU-40.AC1). */
export const CreateOverrideInput = z.strictObject({
  documentVersionId: EntityId,
  reason: z.string().max(REASON_MAX),
});
export type CreateOverrideInput = z.infer<typeof CreateOverrideInput>;

/** `POST lot-overrides/{id}/deactivation` (IFU-40.AC6). */
export const EndOverrideInput = z.strictObject({ reason: z.string().max(REASON_MAX) });
export type EndOverrideInput = z.infer<typeof EndOverrideInput>;

/** The declared SHA-256 of a file: 64 hexadecimal characters (IFU-20 rule 3). */
const DeclaredHash = z.string().regex(/^[0-9a-fA-F]{64}$/);

/** The fields of the upload form (IFU-20 rule 1, DEC-092). An empty field is an absent field. */
export const FileUploadFields = z.strictObject({
  languageCode: LanguageCode,
  file: z.instanceof(File),
  sha256: DeclaredHash.optional(),
});
export type FileUploadFields = z.infer<typeof FileUploadFields>;

/**
 * The fields of the replacement form (IFU-32). A `languageCode` is an unknown
 * field, so it is 400 `VAL-4007` (IFU-32.AC4): the replacement keeps the language.
 */
export const ReplacementFields = z.strictObject({
  reason: z.string().max(REASON_MAX),
  file: z.instanceof(File),
  sha256: DeclaredHash.optional(),
});
export type ReplacementFields = z.infer<typeof ReplacementFields>;

/** The longest original file name that the row keeps (information only, IFU-20 rule 5). */
export const ORIGINAL_FILENAME_MAX = FILENAME_MAX;

/** What a service reads from the upload form. The service never sees a `File` (`sds-nextjs-backend` §1). */
export interface UploadedFile {
  readonly bytes: Uint8Array;
  /** The name of the upload. The row keeps it as information, and it never reaches a key or a path. */
  readonly originalFilename: string | null;
  /** The SHA-256 that the request declares, in lowercase, or `null`. */
  readonly declaredSha256: string | null;
}

export interface FileUploadInput extends UploadedFile {
  readonly languageCode: string;
}

export interface ReplacementInput extends UploadedFile {
  readonly reason: string;
}

// ------------------------------------------------------------------- lists

const MAX_QUERY_TEXT_LENGTH = 200;

function queryFault(code: "VAL-4003" | "VAL-4006", field: string, issue: string): AppError {
  const entries: FieldIssue[] = [{ field, issue }];
  return new AppError(code, CODE_MEANINGS[code], { details: entries });
}

export interface DocumentListQuery extends Paging {
  readonly productId: string | null;
  /** A search text for the document number and the title. */
  readonly q: string | null;
}

/**
 * Reads the query of `GET documents`. An unknown parameter is ignored.
 *
 * @throws AppError `VAL-4003`, `VAL-4005` and `VAL-4006` as `parsePaging` does.
 */
export function parseDocumentListQuery(params: URLSearchParams): DocumentListQuery {
  const paging = parsePaging(params);
  const rawProduct = params.get("productId");
  let productId: string | null = null;
  if (rawProduct !== null) {
    const parsed = EntityId.safeParse(rawProduct);
    if (!parsed.success) {
      throw queryFault("VAL-4003", "productId", "is not an id");
    }
    productId = parsed.data;
  }
  const rawText = params.get("q")?.trim() ?? "";
  if (rawText.length > MAX_QUERY_TEXT_LENGTH) {
    throw queryFault("VAL-4006", "q", "is out of range");
  }
  return { ...paging, productId, q: rawText === "" ? null : rawText };
}

export interface LotOverrideListQuery extends Paging {
  /** `null` for both active and ended overrides. */
  readonly active: boolean | null;
}

/** Reads the query of `GET lot-overrides`. */
export function parseLotOverrideListQuery(params: URLSearchParams): LotOverrideListQuery {
  const paging = parsePaging(params);
  const raw = params.get("active");
  if (raw === null) {
    return { ...paging, active: null };
  }
  if (raw !== "true" && raw !== "false") {
    throw queryFault("VAL-4003", "active", "is not true or false");
  }
  return { ...paging, active: raw === "true" };
}

// --------------------------------------------------------------- responses

/** One period of a product (IFU-30). A business date is `YYYY-MM-DD`; `effectiveTo` is outside the period (DEC-061). */
export const PeriodView = z.strictObject({
  id: EntityId,
  documentVersionId: EntityId,
  productId: EntityId,
  effectiveFrom: businessDate,
  effectiveTo: businessDate.nullable(),
  /** Set when the version was withdrawn. The row stays (DEC-010). */
  withdrawnAt: timestamp.nullable(),
});
export type PeriodView = z.infer<typeof PeriodView>;

/** One file of a version. The storage key never leaves the server. */
export const FileView = z.strictObject({
  id: EntityId,
  documentVersionId: EntityId,
  languageCode: z.string(),
  /** The SHA-256 in lowercase hexadecimal. */
  fileHash: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  contentType: z.string(),
  /** The name of the upload, as information (IFU-20 rule 5). */
  originalFilename: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: timestamp,
});
export type FileView = z.infer<typeof FileView>;

/** One replacement of a published file (IFU-32, DEC-065). */
export const ReplacementView = z.strictObject({
  id: EntityId,
  documentVersionId: EntityId,
  languageCode: z.string(),
  previousFileId: EntityId,
  replacementFileId: EntityId,
  previousFileHash: z.string(),
  replacementFileHash: z.string(),
  replacedByUserId: EntityId,
  replacedAt: timestamp,
  reason: z.string(),
});
export type ReplacementView = z.infer<typeof ReplacementView>;

/** One version in the list of the versions of a document. */
export const VersionSummary = z.strictObject({
  id: EntityId,
  documentId: EntityId,
  revision: z.string(),
  status: VersionStatus,
  proposedEffectiveFrom: businessDate.nullable(),
  /** The period of the version. A `DRAFT` has none. */
  period: PeriodView.nullable(),
  fileCount: z.number().int().nonnegative(),
  publishedAt: timestamp.nullable(),
  supersededAt: timestamp.nullable(),
  withdrawnAt: timestamp.nullable(),
  createdAt: timestamp,
});
export type VersionSummary = z.infer<typeof VersionSummary>;

/** One version with its files, its period and its replacements (the version page, DEC-095). */
export const VersionDetail = VersionSummary.extend({
  documentNumber: z.string(),
  documentTitle: DocumentTitle,
  product: ProductRef,
  publishedByUserId: EntityId.nullable(),
  withdrawnByUserId: EntityId.nullable(),
  withdrawalReason: z.string().nullable(),
  /** The files of the version, active first, then by language code. */
  files: z.array(FileView),
  replacements: z.array(ReplacementView),
  updatedAt: timestamp,
});
export type VersionDetail = z.infer<typeof VersionDetail>;

/** The version that applies today, as the list of documents shows it. */
export const VersionInForce = z.strictObject({
  versionId: EntityId,
  revision: z.string(),
  status: VersionStatus,
  effectiveFrom: businessDate,
});
export type VersionInForce = z.infer<typeof VersionInForce>;

/** A row of the list of documents. */
export const DocumentSummary = z.strictObject({
  id: EntityId,
  documentNumber: z.string(),
  documentType: DocumentType,
  title: DocumentTitle,
  product: ProductRef,
  /** The version whose period contains today (DEC-012), or `null`. */
  versionInForce: VersionInForce.nullable(),
  versionCount: z.number().int().nonnegative(),
  createdAt: timestamp,
});
export type DocumentSummary = z.infer<typeof DocumentSummary>;

/** One document with its versions, their states and their periods. */
export const DocumentDetail = DocumentSummary.extend({
  /** `false` after the first publication of a version: the product no longer changes (IFU-10 rule 2). */
  productChangeAllowed: z.boolean(),
  versions: z.array(VersionSummary),
  updatedAt: timestamp,
});
export type DocumentDetail = z.infer<typeof DocumentDetail>;

/** One override of a LOT, with the LOT and the target version (IFU-40, DEC-094). */
export const LotOverrideView = z.strictObject({
  id: EntityId,
  lotId: EntityId,
  lotNumber: z.string(),
  catalogNumber: z.string(),
  productId: EntityId,
  documentVersionId: EntityId,
  documentId: EntityId,
  documentNumber: z.string(),
  revision: z.string(),
  /** The state of the target version now. A `WITHDRAWN` target shows a warning (IFU-40 rule 5). */
  versionStatus: VersionStatus,
  reason: z.string(),
  createdByUserId: EntityId,
  createdAt: timestamp,
  isActive: z.boolean(),
  endedByUserId: EntityId.nullable(),
  endedAt: timestamp.nullable(),
  endReason: z.string().nullable(),
});
export type LotOverrideView = z.infer<typeof LotOverrideView>;

/** The answer of `GET lots/{lotId}/overrides`: the active override, and the ended ones, newest first. */
export interface LotOverrides {
  readonly active: LotOverrideView | null;
  readonly history: readonly LotOverrideView[];
}

/** The answer of the publication (IFU-30 rule 3). */
export interface PublicationResult {
  readonly version: VersionDetail;
  readonly period: PeriodView;
  /** The version that the publication moved to `SUPERSEDED`, or `null`. */
  readonly supersededVersionId: string | null;
}

/** The answer of the withdrawal (IFU-31). */
export interface WithdrawalResult {
  readonly version: VersionDetail;
  /** The version that the withdrawal moved back to `PUBLISHED`, or `null`. */
  readonly reopenedVersionId: string | null;
}

/** The answer of the replacement of a published file (IFU-32). */
export interface ReplacementResult {
  readonly file: FileView;
  readonly replacement: ReplacementView;
}

interface ListPage<TQuery> {
  readonly page: number;
  readonly count: number;
  readonly totalCount: number;
  readonly filterParams: TQuery;
}

export interface DocumentListPage extends ListPage<DocumentListQuery> {
  readonly documents: readonly DocumentSummary[];
}

export interface LotOverrideListPage extends ListPage<LotOverrideListQuery> {
  readonly overrides: readonly LotOverrideView[];
}
