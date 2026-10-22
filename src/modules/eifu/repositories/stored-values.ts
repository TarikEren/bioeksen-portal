/**
 * The decoding of stored values that the e-IFU repositories share.
 *
 * A check constraint keeps the closed sets and the shape of the JSON out of the
 * tables, so a value that fails here is a defect of the store, never a fault of a
 * request. The error is a plain `Error`, as in the repositories of `catalog`.
 */
import "server-only";

import { z } from "zod";

import { type DocumentTitle, VersionStatus } from "@/lib/schemas/eifu";

/**
 * How a read locks the row, for a check that a write follows (`sds-database` §5).
 * A lock needs a transaction. `no-key-update` blocks a write of the row and not
 * the foreign-key check of a child row, so a parent row that other transactions
 * reference is locked with it and never with `update`.
 */
export type RowLock = "none" | "share" | "update" | "no-key-update";

const StoredTitle = z.object({ tr: z.string(), en: z.string() });

/** The title of a document, from the `jsonb` column. */
export function toStoredTitle(value: unknown): DocumentTitle {
  const parsed = StoredTitle.safeParse(value);
  if (!parsed.success) {
    throw new Error("The store holds a title that has no entry in both languages");
  }
  return { tr: parsed.data.tr, en: parsed.data.en };
}

/** The state of a version, from the `text` column. */
export function toVersionStatus(value: string): VersionStatus {
  const parsed = VersionStatus.safeParse(value);
  if (!parsed.success) {
    throw new Error("The store holds a version state that is not in the closed set");
  }
  return parsed.data;
}
