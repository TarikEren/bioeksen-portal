/**
 * The DTOs of the catalog services: what an answer shows, never a record
 * (`sds-nextjs-backend` §3). The routes, the actions and the pages share them.
 * The mappers read the rows of the repositories.
 */
import "server-only";

import { AppError, CODE_MEANINGS } from "@/lib/errors";
import {
  type CatalogNumberView,
  type LotImportRowView,
  type LotImportView,
  type LotView,
  type Paging,
  type ProductDetail,
  type ProductSummary,
} from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";

import { readEncodedDate } from "../domain/lot-number";
import type { CatalogNumberRow } from "../repositories/catalog-number-repository";
import type { LotImportRecord, LotImportRowRecord } from "../repositories/lot-import-repository";
import type { LotRow } from "../repositories/lot-repository";
import type { ProductRow } from "../repositories/product-repository";

/** 404 `RES-4200`. The answer does not tell a missing record from a record that the caller may not see. */
export function notFound(): AppError {
  return new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
}

/** The `bigint` key of a text id, or `null` for an id of a wrong form (a malformed id names no record). */
export function parseCatalogId(id: string): bigint | null {
  return EntityId.safeParse(id).success ? BigInt(id) : null;
}

/** The `bigint` key of a text id that a service reads for a record that must exist. @throws AppError `RES-4200`. */
export function requireCatalogId(id: string): bigint {
  const parsed = parseCatalogId(id);
  if (parsed === null) {
    throw notFound();
  }
  return parsed;
}

export function toCatalogNumberView(row: CatalogNumberRow, lotCount: number): CatalogNumberView {
  return {
    id: String(row.id),
    productId: String(row.productId),
    catalogNumber: row.catalogNumber,
    packSize: row.packSize,
    format: row.format,
    isActive: row.isActive,
    lotCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The number of LOTs under one product: the sum over its catalog numbers. */
export function lotCountOfCatalogNumbers(catalogNumbers: readonly CatalogNumberRow[], lotCounts: ReadonlyMap<bigint, number>): number {
  return catalogNumbers.reduce((total, row) => total + (lotCounts.get(row.id) ?? 0), 0);
}

export function toProductSummary(
  row: ProductRow,
  catalogNumbers: readonly CatalogNumberRow[],
  lotCounts: ReadonlyMap<bigint, number>,
): ProductSummary {
  return {
    id: String(row.id),
    internalCode: row.internalCode,
    name: row.name,
    regulatoryStatus: row.regulatoryStatus,
    kitCodeBase: row.kitCodeBase,
    isActive: row.isActive,
    catalogNumberCount: catalogNumbers.length,
    lotCount: lotCountOfCatalogNumbers(catalogNumbers, lotCounts),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toProductDetail(
  row: ProductRow,
  catalogNumbers: readonly CatalogNumberRow[],
  lotCounts: ReadonlyMap<bigint, number>,
): ProductDetail {
  return {
    ...toProductSummary(row, catalogNumbers, lotCounts),
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
    catalogNumbers: catalogNumbers.map((catalogNumber) => toCatalogNumberView(catalogNumber, lotCounts.get(catalogNumber.id) ?? 0)),
  };
}

export function toLotView(row: LotRow, catalogNumber: CatalogNumberRow): LotView {
  const encoded = readEncodedDate(row.lotNumber);
  return {
    id: String(row.id),
    catalogNumberId: String(catalogNumber.id),
    catalogNumber: catalogNumber.catalogNumber,
    productId: String(catalogNumber.productId),
    lotNumber: row.lotNumber,
    manufacturingDate: row.manufacturingDate,
    manufacturingDateSource: row.manufacturingDateSource,
    suppliedManufacturingDate: row.suppliedManufacturingDate,
    // A stored LOT number always encodes a date. The fallback keeps the view total.
    encodedManufacturingDate: encoded.status === "ok" ? encoded.date : row.manufacturingDate,
    expiryDate: row.expiryDate,
    hasDateConflict: row.hasDateConflict,
    lotImportId: row.lotImportId === null ? null : String(row.lotImportId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toLotImportView(row: LotImportRecord): LotImportView {
  return {
    id: String(row.id),
    sourceFilename: row.sourceFilename,
    sourceHash: row.sourceHash,
    productId: row.productId === null ? null : String(row.productId),
    uploadedByUserId: String(row.uploadedByUserId),
    status: row.status,
    rowCount: row.rowCount,
    createdCount: row.createdCount,
    existingCount: row.existingCount,
    conflictCount: row.conflictCount,
    invalidCount: row.invalidCount,
    failureCode: row.failureCode,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
  };
}

export function toLotImportRowView(row: LotImportRowRecord): LotImportRowView {
  return {
    id: String(row.id),
    rowNumber: row.rowNumber,
    outcome: row.outcome,
    reason: row.reason,
    rawCells: row.rawCells,
    lotId: row.lotId === null ? null : String(row.lotId),
  };
}

/** One page of an ordered list, and the size of the whole list. A page beyond the last is empty (`sds-api-design`, **Lists**). */
export function pageOf<T>(items: readonly T[], paging: Paging): { readonly slice: T[]; readonly totalCount: number } {
  const start = (paging.page - 1) * paging.limit;
  return { slice: items.slice(start, start + paging.limit), totalCount: items.length };
}
