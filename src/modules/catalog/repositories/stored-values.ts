/**
 * The decoding of stored values that the catalog repositories share.
 *
 * A check constraint keeps the closed sets and the shape of the JSON out of the
 * tables, so a value that fails here is a defect of the store, never a fault of a
 * request. The error is a plain `Error`, as in the repositories of `identity`.
 */
import "server-only";

import { z } from "zod";

import {
  Format,
  ImportStatus,
  ManufacturingDateSource,
  Outcome,
  Reason,
  RegulatoryStatus,
} from "@/lib/schemas/catalog";

/** How a read locks the row, for a check that a write follows (`sds-database` §5). */
export type RowLock = "none" | "share" | "update";

const StoredText = z.object({ tr: z.string(), en: z.string() });

/** The two-language text of a `jsonb` column. */
export function toStoredText(value: unknown): { readonly tr: string; readonly en: string } {
  const parsed = StoredText.safeParse(value);
  if (!parsed.success) {
    throw new Error("The store holds a localized text that has no entry in both languages");
  }
  return { tr: parsed.data.tr, en: parsed.data.en };
}

/** The raw cells of an import row, from the `jsonb` column. */
const StoredCells = z.object({
  catalogNumber: z.string().optional(),
  lotNumber: z.string().optional(),
  manufacturingDate: z.string().optional(),
});

export function toStoredCells(value: unknown): z.infer<typeof StoredCells> {
  const parsed = StoredCells.safeParse(value);
  if (!parsed.success) {
    throw new Error("The store holds raw cells of an import row in a form that no import writes");
  }
  return parsed.data;
}

function parseStored<TValue>(schema: z.ZodType<TValue>, value: string, what: string): TValue {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`The store holds ${what} that is not in the closed set`);
  }
  return parsed.data;
}

export const toRegulatoryStatus = (value: string): RegulatoryStatus =>
  parseStored(RegulatoryStatus, value, "a regulatory status");
export const toFormat = (value: string | null): Format | null =>
  value === null ? null : parseStored(Format, value, "a format");
export const toSource = (value: string): ManufacturingDateSource =>
  parseStored(ManufacturingDateSource, value, "a manufacturing date source");
export const toOutcome = (value: string): Outcome => parseStored(Outcome, value, "an outcome");
export const toReason = (value: string | null): Reason | null =>
  value === null ? null : parseStored(Reason, value, "a reason");
export const toImportStatus = (value: string): ImportStatus => parseStored(ImportStatus, value, "an import status");
