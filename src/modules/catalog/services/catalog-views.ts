/**
 * The DTOs of the catalog services: what an answer shows, never a record
 * (`sds-nextjs-backend` §3). The routes, the actions and the pages share them.
 *
 * MOCK: CAT-10, CAT-20, CAT-40, CAT-60. The mappers read the mock rows. Step 4
 * maps the rows of the repositories to the same views.
 */
import "server-only";

import {
  type MockCatalogNumber,
  type MockLot,
  type MockLotImport,
  type MockLotImportRow,
  type MockProduct,
  getCatalogMock,
} from "@/lib/mock/catalog";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import type {
  CatalogNumberView,
  LotImportRowView,
  LotImportView,
  LotView,
  Paging,
  ProductDetail,
  ProductSummary,
} from "@/lib/schemas/catalog";

import { readEncodedDate } from "../domain/lot-number";

/** 404 `RES-4200`. The answer does not tell a missing record from a record that the caller may not see. */
export function notFound(): AppError {
  return new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
}

/** The catalog numbers of a product, in the order of the ids. */
export function catalogNumbersOf(productId: string): MockCatalogNumber[] {
  return [...getCatalogMock().catalogNumbers.values()].filter((candidate) => candidate.productId === productId);
}

/** The LOTs of a catalog number. */
export function lotsOfCatalogNumber(catalogNumberId: string): MockLot[] {
  return [...getCatalogMock().lots.values()].filter((candidate) => candidate.catalogNumberId === catalogNumberId);
}

/** The number of LOTs under a product, through its catalog numbers. */
export function lotCountOfProduct(productId: string): number {
  return catalogNumbersOf(productId).reduce((total, candidate) => total + lotsOfCatalogNumber(candidate.id).length, 0);
}

export function toCatalogNumberView(row: MockCatalogNumber): CatalogNumberView {
  return {
    id: row.id,
    productId: row.productId,
    catalogNumber: row.catalogNumber,
    packSize: row.packSize,
    format: row.format,
    isActive: row.isActive,
    lotCount: lotsOfCatalogNumber(row.id).length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProductSummary(row: MockProduct): ProductSummary {
  return {
    id: row.id,
    internalCode: row.internalCode,
    name: row.name,
    regulatoryStatus: row.regulatoryStatus,
    kitCodeBase: row.kitCodeBase,
    isActive: row.isActive,
    catalogNumberCount: catalogNumbersOf(row.id).length,
    lotCount: lotCountOfProduct(row.id),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toProductDetail(row: MockProduct): ProductDetail {
  return {
    ...toProductSummary(row),
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
    catalogNumbers: catalogNumbersOf(row.id).map(toCatalogNumberView),
  };
}

export function toLotView(row: MockLot, catalogNumber: MockCatalogNumber): LotView {
  const encoded = readEncodedDate(row.lotNumber);
  return {
    id: row.id,
    catalogNumberId: catalogNumber.id,
    catalogNumber: catalogNumber.catalogNumber,
    productId: catalogNumber.productId,
    lotNumber: row.lotNumber,
    manufacturingDate: row.manufacturingDate,
    manufacturingDateSource: row.manufacturingDateSource,
    suppliedManufacturingDate: row.suppliedManufacturingDate,
    // A stored LOT number always encodes a date. The fallback keeps the view total.
    encodedManufacturingDate: encoded.status === "ok" ? encoded.date : row.manufacturingDate,
    expiryDate: row.expiryDate,
    hasDateConflict: row.hasDateConflict,
    lotImportId: row.lotImportId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toLotImportView(row: MockLotImport): LotImportView {
  return {
    id: row.id,
    sourceFilename: row.sourceFilename,
    sourceHash: row.sourceHash,
    productId: row.productId,
    uploadedByUserId: row.uploadedByUserId,
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

export function toLotImportRowView(row: MockLotImportRow): LotImportRowView {
  return { id: row.id, rowNumber: row.rowNumber, outcome: row.outcome, reason: row.reason, rawCells: row.rawCells, lotId: row.lotId };
}

/** Orders by id, ascending. A key is a `bigint` as text (DEC-009). */
export function byIdAscending<T extends { readonly id: string }>(left: T, right: T): number {
  return Number(left.id) - Number(right.id);
}

/** Orders by id, descending: the newest first. */
export function byIdDescending<T extends { readonly id: string }>(left: T, right: T): number {
  return Number(right.id) - Number(left.id);
}

/** One page of an ordered list, and the size of the whole list. A page beyond the last is empty (`sds-api-design`, **Lists**). */
export function pageOf<T>(items: readonly T[], paging: Paging): { readonly slice: T[]; readonly totalCount: number } {
  const start = (paging.page - 1) * paging.limit;
  return { slice: items.slice(start, start + paging.limit), totalCount: items.length };
}
