/**
 * The tables `eifu_document_file` and `eifu_file_replacement` (IFU-20, IFU-32).
 * It holds queries and nothing else. It never decides who may do what, and it
 * never deletes a row: the triggers of the tables refuse DELETE and TRUNCATE
 * (DEC-010). A file that is deactivated or replaced keeps its row, and its stored
 * object stays (DEC-124).
 *
 * The storage key is a column of the row, and it never leaves the services.
 */
import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";

import type { RowLock } from "./stored-values";

/** One file as the services read it. */
export interface FileRow {
  readonly id: bigint;
  readonly documentVersionId: bigint;
  readonly languageCode: string;
  readonly storageKey: string;
  readonly fileHash: string;
  readonly fileSizeBytes: number;
  readonly contentType: string;
  readonly originalFilename: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export interface NewFile {
  readonly documentVersionId: bigint;
  readonly languageCode: string;
  readonly storageKey: string;
  readonly fileHash: string;
  readonly fileSizeBytes: number;
  readonly contentType: string;
  readonly originalFilename: string | null;
  readonly now: Date;
}

export interface ReplacementRow {
  readonly id: bigint;
  readonly documentVersionId: bigint;
  readonly languageCode: string;
  readonly previousFileId: bigint;
  readonly replacementFileId: bigint;
  readonly previousFileHash: string;
  readonly replacementFileHash: string;
  readonly replacedByUserId: bigint;
  readonly replacedAt: Date;
  readonly reason: string;
}

export interface NewReplacement {
  readonly documentVersionId: bigint;
  readonly languageCode: string;
  readonly previousFileId: bigint;
  readonly replacementFileId: bigint;
  readonly previousFileHash: string;
  readonly replacementFileHash: string;
  readonly replacedByUserId: bigint;
  readonly now: Date;
  readonly reason: string;
}

interface StoredFile {
  readonly id: bigint;
  readonly documentVersionId: bigint;
  readonly languageCode: string;
  readonly storageKey: string;
  readonly fileHash: string;
  readonly fileSizeBytes: number;
  readonly contentType: string;
  readonly originalFilename: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
}

interface StoredReplacement {
  readonly id: bigint;
  readonly documentVersionId: bigint;
  readonly languageCode: string;
  readonly previousFileId: bigint;
  readonly replacementFileId: bigint;
  readonly previousFileHash: string;
  readonly replacementFileHash: string;
  readonly replacedByUserId: bigint;
  readonly replacedAt: string;
  readonly reason: string;
}

function toFileRow(row: StoredFile): FileRow {
  return {
    id: row.id,
    documentVersionId: row.documentVersionId,
    languageCode: row.languageCode,
    storageKey: row.storageKey,
    fileHash: row.fileHash,
    fileSizeBytes: row.fileSizeBytes,
    contentType: row.contentType,
    originalFilename: row.originalFilename,
    isActive: row.isActive,
    createdAt: fromColumnInstant(row.createdAt),
  };
}

function toReplacementRow(row: StoredReplacement): ReplacementRow {
  return {
    id: row.id,
    documentVersionId: row.documentVersionId,
    languageCode: row.languageCode,
    previousFileId: row.previousFileId,
    replacementFileId: row.replacementFileId,
    previousFileHash: row.previousFileHash,
    replacementFileHash: row.replacementFileHash,
    replacedByUserId: row.replacedByUserId,
    replacedAt: fromColumnInstant(row.replacedAt),
    reason: row.reason,
  };
}

/** The file with the id, or `null`. `update` locks the row, for a deactivation and a replacement. A lock needs a transaction. */
export async function findFileById(executor: Executor, id: bigint, lock: RowLock = "none"): Promise<FileRow | null> {
  const files = executor.orm.public.EifuDocumentFile.where({ id });
  const row = await (lock === "update"
    ? files.forUpdate()
    : lock === "no-key-update"
      ? files.forNoKeyUpdate()
      : lock === "share"
        ? files.forShare()
        : files
  ).first();
  return row === null ? null : toFileRow(row);
}

/** The files of the versions: the active ones first, then by language code and id. */
export async function listFilesOfVersions(executor: Executor, versionIds: readonly bigint[]): Promise<FileRow[]> {
  if (versionIds.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.EifuDocumentFile.where((file) => file.documentVersionId.in([...versionIds]))
    .orderBy([(file) => file.languageCode.asc(), (file) => file.id.asc()])
    .all();
  // A boolean has no sort order in the query builder, so the active files move to the front here. The sort is stable.
  return rows.map(toFileRow).sort((left, right) => Number(right.isActive) - Number(left.isActive));
}

/** The file of the version with the language and the hash, active or not, or `null`: the key of a file names these three. */
export async function findFileByContent(
  executor: Executor,
  documentVersionId: bigint,
  languageCode: string,
  fileHash: string,
): Promise<FileRow | null> {
  const row = await executor.orm.public.EifuDocumentFile.where((file) =>
    and(file.documentVersionId.eq(documentVersionId), file.languageCode.eq(languageCode), file.fileHash.eq(fileHash)),
  ).first();
  return row === null ? null : toFileRow(row);
}

/** The active file of the version for the language, or `null` (`document_file_one_active_per_language`). */
export async function findActiveFile(executor: Executor, documentVersionId: bigint, languageCode: string): Promise<FileRow | null> {
  const row = await executor.orm.public.EifuDocumentFile.where((file) =>
    and(file.documentVersionId.eq(documentVersionId), file.languageCode.eq(languageCode), file.isActive.eq(true)),
  ).first();
  return row === null ? null : toFileRow(row);
}

/** Whether the version has an active file (IFU-30 rule 3, step 2). */
export async function hasActiveFile(executor: Executor, documentVersionId: bigint): Promise<boolean> {
  const row = await executor.orm.public.EifuDocumentFile.where((file) =>
    and(file.documentVersionId.eq(documentVersionId), file.isActive.eq(true)),
  ).first();
  return row !== null;
}

/**
 * Inserts an active file. A second active file for the language fails with
 * `23505` on `document_file_one_active_per_language` (IFU-20.AC4).
 */
export async function insertFile(executor: Executor, file: NewFile): Promise<FileRow> {
  const row = await executor.orm.public.EifuDocumentFile.create({
    documentVersionId: file.documentVersionId,
    languageCode: file.languageCode,
    storageKey: file.storageKey,
    fileHash: file.fileHash,
    fileSizeBytes: file.fileSizeBytes,
    contentType: file.contentType,
    originalFilename: file.originalFilename,
    isActive: true,
    createdAt: toColumnInstant(file.now),
  });
  return toFileRow(row);
}

/** Ends the file for the version. The row stays (DEC-010, IFU-20.AC9). */
export async function markFileInactive(executor: Executor, id: bigint): Promise<void> {
  await executor.orm.public.EifuDocumentFile.where({ id }).update({ isActive: false });
}

/** The replacements of the versions, newest first. */
export async function listReplacementsOfVersions(executor: Executor, versionIds: readonly bigint[]): Promise<ReplacementRow[]> {
  if (versionIds.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.EifuFileReplacement.where((replacement) =>
    replacement.documentVersionId.in([...versionIds]),
  )
    .orderBy((replacement) => replacement.id.desc())
    .all();
  return rows.map(toReplacementRow);
}

/** Inserts the replacement row of IFU-32. The system never changes or deletes it (DEC-010). */
export async function insertReplacement(executor: Executor, replacement: NewReplacement): Promise<ReplacementRow> {
  const row = await executor.orm.public.EifuFileReplacement.create({
    documentVersionId: replacement.documentVersionId,
    languageCode: replacement.languageCode,
    previousFileId: replacement.previousFileId,
    replacementFileId: replacement.replacementFileId,
    previousFileHash: replacement.previousFileHash,
    replacementFileHash: replacement.replacementFileHash,
    replacedByUserId: replacement.replacedByUserId,
    replacedAt: toColumnInstant(replacement.now),
    reason: replacement.reason,
  });
  return toReplacementRow(row);
}
