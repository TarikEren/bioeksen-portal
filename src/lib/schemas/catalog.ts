/**
 * The schemas and types of the catalog API (stage B2 contract, CAT-10, CAT-20,
 * CAT-30, CAT-40, CAT-41, CAT-50, CAT-60).
 *
 * A zod schema is the one source of its type, as in `identity.ts`. An id is a
 * string in JSON, because the key is a `bigint` (DEC-009). A business date is
 * `YYYY-MM-DD` (DEC-039); a time is an RFC 3339 text with an offset. A request
 * body is a strict object: an unknown field is 400 `VAL-4007`. A `PATCH` body is
 * a JSON Merge Patch (RFC 7396): a field left out stays, and `null` removes an
 * optional field.
 *
 * A blank text is an absent text: the service answers 400 `VAL-4001` for a blank
 * `name` entry or `reason` (CAT-10.AC3, CAT-41.AC2), so the schemas give no
 * minimum length to those fields.
 *
 * This file is pure.
 */
import { z } from "zod";

import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";

import { DEFAULT_LIMIT, DEFAULT_PAGE, EntityId, MAX_LIMIT } from "./identity";

export const REGULATORY_STATUSES = ["IVD", "RUO"] as const;
export const RegulatoryStatus = z.enum(REGULATORY_STATUSES);
export type RegulatoryStatus = z.infer<typeof RegulatoryStatus>;

export const FORMATS = ["VCAP", "LYOPHILIZED", "LIQUID"] as const;
export const Format = z.enum(FORMATS);
export type Format = z.infer<typeof Format>;

export const MANUFACTURING_DATE_SOURCES = ["PARSED_FROM_LOT", "SUPPLIED", "MANUAL_CORRECTION"] as const;
export const ManufacturingDateSource = z.enum(MANUFACTURING_DATE_SOURCES);
export type ManufacturingDateSource = z.infer<typeof ManufacturingDateSource>;

/** The outcome of an import row (CAT-60 rule 6). */
export const OUTCOMES = [
  "CREATED",
  "ALREADY_EXISTS",
  "CONFLICT_REVIEW_REQUIRED",
  "INVALID_CATALOG_NUMBER",
  "INVALID_LOT_FORMAT",
  "INVALID_DATE",
] as const;
export const Outcome = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof Outcome>;

/** The reason of an import row (CAT-60 rule 6). A `CREATED` row has none. */
export const REASONS = [
  "LOT_ALREADY_EXISTS",
  "DUPLICATE_ROW",
  "DATE_DIFFERS_FROM_REGISTERED",
  "SUPPLIED_DATE_CONFLICT",
  "KIT_CODE_MISMATCH",
  "CONFLICTING_ROWS",
  "CATALOG_NUMBER_NOT_FOUND",
  "OTHER_PRODUCT",
  "LOT_MISSING",
  "LOT_FORMAT_INVALID",
  "LOT_DATE_INVALID",
  "SUPPLIED_DATE_INVALID",
] as const;
export const Reason = z.enum(REASONS);
export type Reason = z.infer<typeof Reason>;

export const IMPORT_STATUSES = ["PROCESSING", "COMPLETED", "FAILED"] as const;
export const ImportStatus = z.enum(IMPORT_STATUSES);
export type ImportStatus = z.infer<typeof ImportStatus>;

/** The body limit of a LOT import is 5 MiB, and the rows are 5,000 at most (DEC-051). */
export const IMPORT_BODY_LIMIT_BYTES = 5_242_880;
export const IMPORT_MAX_ROWS = 5_000;

/** The longest values that the columns hold (CAT-10, CAT-20, CAT-40). */
export const INTERNAL_CODE_MAX = 64;
export const KIT_CODE_BASE_MAX = 32;
export const CATALOG_NUMBER_MAX = 64;
export const PACK_SIZE_MAX = 32;
export const LOT_NUMBER_MAX = 64;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const REASON_MAX = 500;
/** The longest raw text that a LOT or catalog number field takes before cleanup. */
const RAW_CELL_MAX = 200;

const timestamp = z.iso.datetime({ offset: true });
/** A calendar date, `YYYY-MM-DD` (DEC-039). */
const businessDate = z.iso.date();

/** A text in both languages (DEC-011). The service checks that each entry is not blank. */
export const LocalizedName = z.strictObject({ tr: z.string().max(NAME_MAX), en: z.string().max(NAME_MAX) });
export type LocalizedName = z.infer<typeof LocalizedName>;

export const LocalizedDescription = z.strictObject({
  tr: z.string().max(DESCRIPTION_MAX),
  en: z.string().max(DESCRIPTION_MAX),
});
export type LocalizedDescription = z.infer<typeof LocalizedDescription>;

// ---------------------------------------------------------------- requests

/** `POST products` (CAT-10.AC1). The regulatory status has no default (DEC-041). */
export const CreateProductInput = z.strictObject({
  internalCode: z.string().trim().min(1).max(INTERNAL_CODE_MAX),
  name: LocalizedName,
  description: LocalizedDescription.optional(),
  regulatoryStatus: RegulatoryStatus,
  kitCodeBase: z.string().trim().min(1).max(KIT_CODE_BASE_MAX).optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductInput>;

/** `PATCH products/{id}`, a JSON Merge Patch. A member of `name` or `description` merges; `null` removes. */
export const UpdateProductInput = z.strictObject({
  internalCode: z.string().trim().min(1).max(INTERNAL_CODE_MAX).optional(),
  name: z.strictObject({ tr: z.string().max(NAME_MAX).optional(), en: z.string().max(NAME_MAX).optional() }).optional(),
  description: z
    .strictObject({
      tr: z.string().max(DESCRIPTION_MAX).nullable().optional(),
      en: z.string().max(DESCRIPTION_MAX).nullable().optional(),
    })
    .nullable()
    .optional(),
  regulatoryStatus: RegulatoryStatus.optional(),
  kitCodeBase: z.string().trim().min(1).max(KIT_CODE_BASE_MAX).nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof UpdateProductInput>;

/** `POST products/{id}/catalog-numbers` (CAT-20.AC1). Cleanup runs once, in the service (CAT-20 rule 2). */
export const CatalogNumberInput = z.strictObject({
  catalogNumber: z.string().max(RAW_CELL_MAX),
  packSize: z.string().trim().min(1).max(PACK_SIZE_MAX).optional(),
  format: Format.optional(),
});
export type CatalogNumberInput = z.infer<typeof CatalogNumberInput>;

/** `PATCH catalog-numbers/{id}`, a JSON Merge Patch. `productId` moves the catalog number (CAT-20.AC4). */
export const UpdateCatalogNumberInput = z.strictObject({
  packSize: z.string().trim().min(1).max(PACK_SIZE_MAX).nullable().optional(),
  format: Format.nullable().optional(),
  productId: EntityId.optional(),
});
export type UpdateCatalogNumberInput = z.infer<typeof UpdateCatalogNumberInput>;

/** `POST catalog-numbers/{id}/lots` (CAT-40, DEC-050). Cleanup runs once, in the service (CAT-30 rule 4). */
export const RegisterLotInput = z.strictObject({
  lotNumber: z.string().max(RAW_CELL_MAX),
  suppliedManufacturingDate: businessDate.optional(),
  expiryDate: businessDate.optional(),
  confirmKitCodeMismatch: z.boolean().optional(),
});
export type RegisterLotInput = z.infer<typeof RegisterLotInput>;

/** `POST lots/{id}/manufacturing-date-correction` (CAT-41). The service checks that the reason is not blank. */
export const CorrectionInput = z.strictObject({
  manufacturingDate: businessDate,
  reason: z.string().max(REASON_MAX),
});
export type CorrectionInput = z.infer<typeof CorrectionInput>;

/**
 * The fields of the import form (DEC-054): `text` or `file`, and the optional
 * `productId` and `catalogNumber`. An empty field is an absent field, so a form
 * with an empty choice of product is valid.
 */
export const LotImportFields = z.strictObject({
  text: z.string().optional(),
  file: z.instanceof(File).optional(),
  productId: EntityId.optional(),
  catalogNumber: z.string().max(RAW_CELL_MAX).optional(),
});
export type LotImportFields = z.infer<typeof LotImportFields>;

/** The input of a LOT import after the form is read. The service never sees a `FormData` (`sds-nextjs-backend` §1). */
export type ImportSource =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "file"; readonly filename: string | null; readonly bytes: Uint8Array };

export interface LotImportInput {
  readonly source: ImportSource;
  /** An import for one product (CAT-60 rule 5). */
  readonly productId: string | null;
  /** The catalog number of an input that has no catalog number column (CAT-60 rule 4). */
  readonly catalogNumber: string | null;
}

// ------------------------------------------------------------------- lists

const MAX_QUERY_TEXT_LENGTH = 200;
const INTEGER_PATTERN = /^-?\d{1,15}$/;

export interface Paging {
  readonly page: number;
  readonly limit: number;
}

/**
 * Reads `page` and `limit` as `sds-api-design` (**Lists**) says, as
 * `parseUserListQuery` does.
 *
 * @throws AppError `VAL-4003` for a value that is not an integer; `VAL-4005` for a value out of range.
 */
export function parsePaging(params: URLSearchParams): Paging {
  const malformed: FieldIssue[] = [];
  const readInteger = (name: string, fallback: number): number => {
    const raw = params.get(name);
    if (raw === null) {
      return fallback;
    }
    if (!INTEGER_PATTERN.test(raw)) {
      malformed.push({ field: name, issue: "is not an integer" });
      return fallback;
    }
    return Number(raw);
  };
  const page = readInteger("page", DEFAULT_PAGE);
  const limit = readInteger("limit", DEFAULT_LIMIT);
  if (malformed.length > 0) {
    throw new AppError("VAL-4003", CODE_MEANINGS["VAL-4003"], { details: malformed });
  }
  const range: FieldIssue[] = [];
  if (page < 1) {
    range.push({ field: "page", issue: "is out of range" });
  }
  if (limit < 1 || limit > MAX_LIMIT) {
    range.push({ field: "limit", issue: "is out of range" });
  }
  if (range.length > 0) {
    throw new AppError("VAL-4005", CODE_MEANINGS["VAL-4005"], { details: range });
  }
  return { page, limit };
}

function readText(params: URLSearchParams, name: string): string | null {
  const raw = params.get(name)?.trim() ?? "";
  if (raw.length > MAX_QUERY_TEXT_LENGTH) {
    throw new AppError("VAL-4006", CODE_MEANINGS["VAL-4006"], { details: [{ field: name, issue: "is out of range" }] });
  }
  return raw === "" ? null : raw;
}

function readBoolean(params: URLSearchParams, name: string): boolean | null {
  const raw = params.get(name);
  if (raw === null) {
    return null;
  }
  if (raw !== "true" && raw !== "false") {
    throw new AppError("VAL-4003", CODE_MEANINGS["VAL-4003"], { details: [{ field: name, issue: "is not true or false" }] });
  }
  return raw === "true";
}

function readId(params: URLSearchParams, name: string): string | null {
  const raw = params.get(name);
  if (raw === null) {
    return null;
  }
  const parsed = EntityId.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("VAL-4003", CODE_MEANINGS["VAL-4003"], { details: [{ field: name, issue: "is not an id" }] });
  }
  return parsed.data;
}

export interface ProductListQuery extends Paging {
  /** A search text for the stem, the name in either language and the catalog numbers. */
  readonly q: string | null;
  /** `null` for both active and inactive products. */
  readonly active: boolean | null;
}

/** Reads the query of `GET products`. An unknown parameter is ignored. */
export function parseProductListQuery(params: URLSearchParams): ProductListQuery {
  return { ...parsePaging(params), q: readText(params, "q"), active: readBoolean(params, "active") };
}

export interface LotListQuery extends Paging {
  readonly catalogNumberId: string | null;
  /** `true` for the LOTs with a date conflict only, `false` for the others, `null` for all. */
  readonly conflict: boolean | null;
}

/** Reads the query of `GET products/{id}/lots`. */
export function parseLotListQuery(params: URLSearchParams): LotListQuery {
  return { ...parsePaging(params), catalogNumberId: readId(params, "catalogNumberId"), conflict: readBoolean(params, "conflict") };
}

/** The query of `GET lot-imports`. */
export type ImportListQuery = Paging;

export function parseImportListQuery(params: URLSearchParams): ImportListQuery {
  return parsePaging(params);
}

export interface ImportRowListQuery extends Paging {
  readonly outcome: Outcome | null;
}

/**
 * Reads the query of `GET lot-imports/{id}/rows`.
 *
 * @throws AppError `VAL-4002` for an outcome that does not exist.
 */
export function parseImportRowListQuery(params: URLSearchParams): ImportRowListQuery {
  const paging = parsePaging(params);
  const raw = params.get("outcome");
  if (raw === null) {
    return { ...paging, outcome: null };
  }
  const outcome = Outcome.safeParse(raw);
  if (!outcome.success) {
    throw new AppError("VAL-4002", CODE_MEANINGS["VAL-4002"], {
      details: [{ field: "outcome", issue: "is not one of the allowed values" }],
    });
  }
  return { ...paging, outcome: outcome.data };
}

// --------------------------------------------------------------- responses

/** One catalog number of a product. */
export const CatalogNumberView = z.strictObject({
  id: EntityId,
  productId: EntityId,
  catalogNumber: z.string(),
  packSize: z.string().nullable(),
  format: Format.nullable(),
  isActive: z.boolean(),
  lotCount: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type CatalogNumberView = z.infer<typeof CatalogNumberView>;

/** A row of the product list. */
export const ProductSummary = z.strictObject({
  id: EntityId,
  internalCode: z.string(),
  name: LocalizedName,
  regulatoryStatus: RegulatoryStatus,
  kitCodeBase: z.string().nullable(),
  isActive: z.boolean(),
  catalogNumberCount: z.number().int().nonnegative(),
  lotCount: z.number().int().nonnegative(),
  createdAt: timestamp,
});
export type ProductSummary = z.infer<typeof ProductSummary>;

/** One product with its catalog numbers. */
export const ProductDetail = ProductSummary.extend({
  description: LocalizedDescription.nullable(),
  updatedAt: timestamp,
  catalogNumbers: z.array(CatalogNumberView),
});
export type ProductDetail = z.infer<typeof ProductDetail>;

/** One LOT, with its dates, the source of the manufacturing date and the conflict marker (CAT-40). */
export const LotView = z.strictObject({
  id: EntityId,
  catalogNumberId: EntityId,
  catalogNumber: z.string(),
  productId: EntityId,
  lotNumber: z.string(),
  manufacturingDate: businessDate,
  manufacturingDateSource: ManufacturingDateSource,
  /** The date that the person or the file supplied. It differs from the encoded date while `hasDateConflict` is true. */
  suppliedManufacturingDate: businessDate.nullable(),
  /** The date that the LOT number encodes (DEC-044). It shows beside the date of a correction (CAT-41). */
  encodedManufacturingDate: businessDate,
  expiryDate: businessDate.nullable(),
  hasDateConflict: z.boolean(),
  lotImportId: EntityId.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type LotView = z.infer<typeof LotView>;

/** One row of an import plan, before the commit. */
export const ImportPlanRow = z.strictObject({
  rowNumber: z.number().int().positive(),
  /** The cells of the row as they arrived, before transport cleanup (CAT-60 rule 10). */
  rawCells: z.strictObject({
    catalogNumber: z.string().optional(),
    lotNumber: z.string().optional(),
    manufacturingDate: z.string().optional(),
  }),
  catalogNumberId: EntityId.nullable(),
  lotNumber: z.string().nullable(),
  manufacturingDate: businessDate.nullable(),
  outcome: Outcome,
  reason: Reason.nullable(),
});
export type ImportPlanRow = z.infer<typeof ImportPlanRow>;

/** The rows of one product in a plan. A row with no known product goes to the group with `productId` `null`. */
export const ImportPlanGroup = z.strictObject({
  productId: EntityId.nullable(),
  internalCode: z.string().nullable(),
  regulatoryStatus: RegulatoryStatus.nullable(),
  rows: z.array(ImportPlanRow),
});
export type ImportPlanGroup = z.infer<typeof ImportPlanGroup>;

export const ImportCounts = z.strictObject({
  created: z.number().int().nonnegative(),
  existing: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
});
export type ImportCounts = z.infer<typeof ImportCounts>;

/** The answer of `POST lot-imports/preview` (CAT-60 rule 1, rule 9). */
export const ImportPlan = z.strictObject({
  rowCount: z.number().int().nonnegative(),
  counts: ImportCounts,
  groups: z.array(ImportPlanGroup),
  /** The SHA-256 of the input, in lowercase hexadecimal (CAT-60 rule 9). */
  sourceHash: z.string(),
  /** The id of the latest earlier import with the same hash, or `null`. The preview shows a warning for it. */
  sameHashImportId: EntityId.nullable(),
});
export type ImportPlan = z.infer<typeof ImportPlan>;

/** One import and its counts (the screen *LOT imports*). */
export const LotImportView = z.strictObject({
  id: EntityId,
  sourceFilename: z.string().nullable(),
  sourceHash: z.string(),
  productId: EntityId.nullable(),
  uploadedByUserId: EntityId,
  status: ImportStatus,
  rowCount: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  existingCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  invalidCount: z.number().int().nonnegative(),
  /** The code of the error that stopped the import. Only a `FAILED` import has it. */
  failureCode: z.string().nullable(),
  createdAt: timestamp,
  completedAt: timestamp.nullable(),
});
export type LotImportView = z.infer<typeof LotImportView>;

/** One row of an import report. */
export const LotImportRowView = z.strictObject({
  id: EntityId,
  rowNumber: z.number().int().positive(),
  outcome: Outcome,
  reason: Reason.nullable(),
  rawCells: ImportPlanRow.shape.rawCells,
  lotId: EntityId.nullable(),
});
export type LotImportRowView = z.infer<typeof LotImportRowView>;

/** A page of a list, in the body of `sds-api-design` (**Lists**). `T` names the collection. */
interface ListPage<TQuery> {
  readonly page: number;
  readonly count: number;
  readonly totalCount: number;
  readonly filterParams: TQuery;
}

export interface ProductListPage extends ListPage<ProductListQuery> {
  readonly products: readonly ProductSummary[];
}

export interface LotListPage extends ListPage<LotListQuery> {
  readonly lots: readonly LotView[];
}

export interface LotImportListPage extends ListPage<ImportListQuery> {
  readonly imports: readonly LotImportView[];
}

export interface LotImportRowListPage extends ListPage<ImportRowListQuery> {
  readonly rows: readonly LotImportRowView[];
}
