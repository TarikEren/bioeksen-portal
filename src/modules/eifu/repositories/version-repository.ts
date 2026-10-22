/**
 * The table `eifu_document_version` (IFU-10, IFU-30, IFU-31). It holds queries
 * and nothing else. It never decides who may do what, and it never deletes a row:
 * the triggers of the table refuse DELETE and TRUNCATE (DEC-010).
 *
 * A proposed start date is a business date (DEC-039): the column carries the text
 * `YYYY-MM-DD`, and this file never turns it into an instant.
 */
import "server-only";

import { and, not } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";
import type { VersionStatus } from "@/lib/schemas/eifu";

import { type RowLock, toVersionStatus } from "./stored-values";

/** One version as the services read it. */
export interface VersionRow {
  readonly id: bigint;
  readonly documentId: bigint;
  readonly revision: string;
  readonly status: VersionStatus;
  readonly proposedEffectiveFrom: string | null;
  readonly publishedAt: Date | null;
  readonly publishedByUserId: bigint | null;
  readonly supersededAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly withdrawnByUserId: bigint | null;
  readonly withdrawalReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewVersion {
  readonly documentId: bigint;
  readonly revision: string;
  readonly proposedEffectiveFrom: string | null;
  readonly now: Date;
}

interface StoredVersion {
  readonly id: bigint;
  readonly documentId: bigint;
  readonly revision: string;
  readonly status: string;
  readonly proposedEffectiveFrom: string | null;
  readonly publishedAt: string | null;
  readonly publishedByUserId: bigint | null;
  readonly supersededAt: string | null;
  readonly withdrawnAt: string | null;
  readonly withdrawnByUserId: bigint | null;
  readonly withdrawalReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const instantOrNull = (stored: string | null): Date | null => (stored === null ? null : fromColumnInstant(stored));

function toVersionRow(row: StoredVersion): VersionRow {
  return {
    id: row.id,
    documentId: row.documentId,
    revision: row.revision,
    status: toVersionStatus(row.status),
    proposedEffectiveFrom: row.proposedEffectiveFrom,
    publishedAt: instantOrNull(row.publishedAt),
    publishedByUserId: row.publishedByUserId,
    supersededAt: instantOrNull(row.supersededAt),
    withdrawnAt: instantOrNull(row.withdrawnAt),
    withdrawnByUserId: row.withdrawnByUserId,
    withdrawalReason: row.withdrawalReason,
    createdAt: fromColumnInstant(row.createdAt),
    updatedAt: fromColumnInstant(row.updatedAt),
  };
}

/**
 * The version with the id, or `null`. `no-key-update` locks the row for a change
 * of its state, an upload and a publication: they run one after the other, and
 * the foreign-key check of a file or a period does not wait. A lock needs a
 * transaction.
 */
export async function findVersionById(executor: Executor, id: bigint, lock: RowLock = "none"): Promise<VersionRow | null> {
  const versions = executor.orm.public.EifuDocumentVersion.where({ id });
  const row = await (lock === "update"
    ? versions.forUpdate()
    : lock === "no-key-update"
      ? versions.forNoKeyUpdate()
      : lock === "share"
        ? versions.forShare()
        : versions
  ).first();
  return row === null ? null : toVersionRow(row);
}

/** The versions with the ids, in the order of the ids. */
export async function findVersionsByIds(executor: Executor, ids: readonly bigint[]): Promise<VersionRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.EifuDocumentVersion.where((version) => version.id.in([...ids]))
    .orderBy((version) => version.id.asc())
    .all();
  return rows.map(toVersionRow);
}

/** The versions of the documents, in the order of the ids. */
export async function listVersionsOfDocuments(executor: Executor, documentIds: readonly bigint[]): Promise<VersionRow[]> {
  if (documentIds.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.EifuDocumentVersion.where((version) => version.documentId.in([...documentIds]))
    .orderBy((version) => version.id.asc())
    .all();
  return rows.map(toVersionRow);
}

/** Whether a version of the document was published: the product no longer changes (IFU-10 rule 2). */
export async function hasPublishedVersion(executor: Executor, documentId: bigint): Promise<boolean> {
  const row = await executor.orm.public.EifuDocumentVersion.where((version) =>
    and(version.documentId.eq(documentId), not(version.status.eq("DRAFT"))),
  ).first();
  return row !== null;
}

/** Inserts a `DRAFT` version. A second row with the same revision fails with `23505` on `document_version_unique_revision` (IFU-10.AC3). */
export async function insertVersion(executor: Executor, version: NewVersion): Promise<VersionRow> {
  const at = toColumnInstant(version.now);
  const row = await executor.orm.public.EifuDocumentVersion.create({
    documentId: version.documentId,
    revision: version.revision,
    status: "DRAFT",
    proposedEffectiveFrom: version.proposedEffectiveFrom,
    createdAt: at,
    updatedAt: at,
  });
  return toVersionRow(row);
}

/** Writes the proposed start of a `DRAFT` version (IFU-10.AC5). `null` removes it. */
export async function updateProposedEffectiveFrom(executor: Executor, id: bigint, proposedEffectiveFrom: string | null, now: Date): Promise<void> {
  await executor.orm.public.EifuDocumentVersion.where({ id }).update({
    proposedEffectiveFrom,
    updatedAt: toColumnInstant(now),
  });
}

/** Moves a `DRAFT` version to `PUBLISHED` with the time and the publisher (IFU-30 rule 3, step 6). */
export async function markVersionPublished(executor: Executor, id: bigint, userId: bigint, now: Date): Promise<void> {
  const at = toColumnInstant(now);
  await executor.orm.public.EifuDocumentVersion.where({ id }).update({
    status: "PUBLISHED",
    publishedAt: at,
    publishedByUserId: userId,
    updatedAt: at,
  });
}

/** Moves a `PUBLISHED` version to `SUPERSEDED` (IFU-30 rule 3, step 4). */
export async function markVersionSuperseded(executor: Executor, id: bigint, now: Date): Promise<void> {
  const at = toColumnInstant(now);
  await executor.orm.public.EifuDocumentVersion.where({ id }).update({ status: "SUPERSEDED", supersededAt: at, updatedAt: at });
}

/** Moves a `SUPERSEDED` version back to `PUBLISHED`, after the withdrawal of the next version with reopen (IFU-31.AC2). */
export async function markVersionReopened(executor: Executor, id: bigint, now: Date): Promise<void> {
  await executor.orm.public.EifuDocumentVersion.where({ id }).update({
    status: "PUBLISHED",
    supersededAt: null,
    updatedAt: toColumnInstant(now),
  });
}

/** Moves a version to `WITHDRAWN` with the time, the person and the reason (IFU-31). */
export async function markVersionWithdrawn(executor: Executor, id: bigint, userId: bigint, reason: string, now: Date): Promise<void> {
  const at = toColumnInstant(now);
  await executor.orm.public.EifuDocumentVersion.where({ id }).update({
    status: "WITHDRAWN",
    withdrawnAt: at,
    withdrawnByUserId: userId,
    withdrawalReason: reason,
    updatedAt: at,
  });
}
