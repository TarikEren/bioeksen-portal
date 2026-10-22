/**
 * The write of one LOT row, for the single-LOT form and for the import commit.
 *
 * MOCK: CAT-40. It writes to the mock store. Step 4 replaces it with the insert
 * of the LOT repository, inside the transaction of the caller. The audit row is
 * the job of the caller, because a registration and a commit audit differently.
 */
import "server-only";

import { now } from "@/lib/clock";
import { type MockCatalogNumber, type MockLot, getCatalogMock } from "@/lib/mock/catalog";
import type { ManufacturingDateSource } from "@/lib/schemas/catalog";

export interface NewLot {
  readonly lotNumber: string;
  readonly manufacturingDate: string;
  readonly source: ManufacturingDateSource;
  readonly suppliedManufacturingDate: string | null;
  readonly expiryDate: string | null;
  readonly hasDateConflict: boolean;
  readonly lotImportId: string | null;
}

/** Whether the catalog number has a LOT with the LOT number (`lot_unique_per_catalog_number`). */
export function findLotByNumber(catalogNumberId: string, lotNumber: string): MockLot | null {
  return (
    [...getCatalogMock().lots.values()].find(
      (candidate) => candidate.catalogNumberId === catalogNumberId && candidate.lotNumber === lotNumber,
    ) ?? null
  );
}

/** Writes a LOT under a catalog number. */
export function insertLot(catalogNumber: MockCatalogNumber, lot: NewLot): MockLot {
  const state = getCatalogMock();
  const created = now();
  const row: MockLot = {
    id: String(state.nextLotId),
    catalogNumberId: catalogNumber.id,
    lotNumber: lot.lotNumber,
    manufacturingDate: lot.manufacturingDate,
    manufacturingDateSource: lot.source,
    suppliedManufacturingDate: lot.suppliedManufacturingDate,
    expiryDate: lot.expiryDate,
    hasDateConflict: lot.hasDateConflict,
    lotImportId: lot.lotImportId,
    createdAt: created,
    updatedAt: created,
  };
  state.nextLotId += 1;
  state.lots.set(row.id, row);
  return row;
}

/** Removes the LOTs of an import that stopped: the mock of the rollback of the commit transaction (CAT-60 rule 8). */
export function rollbackLots(lotIds: readonly string[]): void {
  const state = getCatalogMock();
  for (const id of lotIds) {
    state.lots.delete(id);
  }
}
