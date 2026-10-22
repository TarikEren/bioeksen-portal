/**
 * The files of a version (IFU-20) and the replacement of a published file
 * (IFU-32).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * runs in one transaction with its audit row (PLT-40). The system deletes no
 * file row and no stored object (DEC-010, DEC-124). The service reads the type
 * from the bytes (IFU-20 rule 2) and calculates the SHA-256 itself (IFU-20
 * rule 3). The bytes go to the object store through `storeDocumentFile` of
 * PLT-10: the key holds ids and the hash, never a part of the file name
 * (DEC-032), and a write never replaces an object.
 *
 * The object is stored before the row is inserted, inside the transaction. When
 * the transaction rolls back, the object stays (DEC-124). The key names the
 * bytes by their SHA-256, so an object that is already at the key holds these
 * bytes: the service uses it and writes no second one.
 */
import "server-only";

import { createHash } from "node:crypto";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError } from "@/lib/errors";
import { type FieldFault, validationError } from "@/lib/http/validation";
import {
  EIFU_ISSUES,
  type FileUploadInput,
  type FileView,
  PDF_CONTENT_TYPE,
  type ReplacementInput,
  type ReplacementResult,
  type UploadedFile,
} from "@/lib/schemas/eifu";
import { type Executor, readExecutor, runTransaction, violatedConstraint } from "@/lib/transaction";
import { signedDownloadUrl, storeDocumentFile } from "@/modules/platform/services/file-service";

import { canonicalLanguageCode } from "../domain/language-code";
import { isPdf } from "../domain/pdf";
import { findDocumentById } from "../repositories/document-repository";
import {
  type FileRow,
  findActiveFile,
  findFileByContent,
  findFileById,
  insertFile,
  insertReplacement,
  markFileInactive,
} from "../repositories/file-repository";
import { type VersionRow, findVersionById } from "../repositories/version-repository";
import {
  alreadyExists,
  notAllowedInState,
  notFound,
  recordAudit,
  requireEifuKey,
  requireReason,
  toFileView,
  toReplacementView,
} from "./eifu-views";

/** The index that the database names for a second active file of one language (IFU-20.AC4). */
const ONE_ACTIVE_RULE = "document_file_one_active_per_language";

/** The time that a download link works (DEC-076): 5 minutes. */
const DOWNLOAD_LINK_SECONDS = 300;

/** The SHA-256 of the bytes, in lowercase hexadecimal. */
function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Checks the bytes of an upload: they exist (IFU-20.AC8), they are a PDF
 * (IFU-20.AC2), and the declared hash is the calculated one (IFU-20.AC7). Each
 * fault names the field `file`.
 *
 * @returns The calculated hash, and the faults.
 */
function checkBytes(upload: UploadedFile): { readonly sha256: string; readonly faults: readonly FieldFault[] } {
  const sha256 = sha256Of(upload.bytes);
  if (upload.bytes.byteLength === 0) {
    return { sha256, faults: [{ code: "VAL-4006", entry: { field: "file", issue: EIFU_ISSUES.fileEmpty } }] };
  }
  if (!isPdf(upload.bytes)) {
    return { sha256, faults: [{ code: "VAL-4006", entry: { field: "file", issue: EIFU_ISSUES.fileNotPdf } }] };
  }
  if (upload.declaredSha256 !== null && upload.declaredSha256 !== sha256) {
    return { sha256, faults: [{ code: "VAL-4006", entry: { field: "file", issue: EIFU_ISSUES.hashDiffers } }] };
  }
  return { sha256, faults: [] };
}

/** The state of a file that the audit row shows. */
function auditState(file: FileRow): { readonly [key: string]: string | number | boolean } {
  return {
    versionId: String(file.documentVersionId),
    languageCode: file.languageCode,
    fileHash: file.fileHash,
    fileSizeBytes: file.fileSizeBytes,
    isActive: file.isActive,
  };
}

/**
 * Stores the bytes at the key of PLT-10 and returns the key. A key that exists
 * already holds these bytes, because the key names them by their SHA-256 (DEC-032):
 * it is the object of an earlier upload that rolled back, or of an inactive file of
 * the same version. The object stays as it is.
 *
 * @throws AppError `UP-5500`, `UP-5501` or `UP-5000` when the object store fails.
 */
async function storeBytes(version: VersionRow, languageCode: string, bytes: Uint8Array): Promise<string> {
  const ids = { documentId: String(version.documentId), versionId: String(version.id), languageCode };
  try {
    return (await storeDocumentFile(ids, bytes)).key;
  } catch (error) {
    if (error instanceof AppError && error.code === "RES-4300") {
      return `documents/${ids.documentId}/${ids.versionId}/${languageCode}/${sha256Of(bytes)}.pdf`;
    }
    throw error;
  }
}

/**
 * Uploads a PDF to a `DRAFT` version (IFU-20.AC1). The upload has one audit row.
 * The language code is stored in its canonical form (DEC-069).
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `VAL-4006` on
 * `file` for bytes that are no PDF, no bytes, or a hash that differs (AC2, AC7,
 * AC8), and on `languageCode` for a tag that is not BCP 47 (AC6); `RES-4200`;
 * `RES-4302` when the version is not `DRAFT` (AC5); `RES-4300` when the version
 * has an active file of the language (AC4); `UP-5500`, `UP-5501` or `UP-5000`
 * when the object store fails.
 */
export async function uploadFile(actor: SessionActor, versionId: string, input: FileUploadInput): Promise<FileView> {
  requirePermission(actor, "eifu.document.manage");
  const faults: FieldFault[] = [];
  const languageCode = canonicalLanguageCode(input.languageCode);
  if (languageCode === null) {
    faults.push({ code: "VAL-4006", entry: { field: "languageCode", issue: EIFU_ISSUES.languageCodeInvalid } });
  }
  const checked = checkBytes(input);
  faults.push(...checked.faults);
  if (faults.length > 0 || languageCode === null) {
    throw validationError(faults);
  }
  const key = requireEifuKey(versionId);
  return runTransaction(async (tx) => {
    // The lock stays until the commit: a publication and a second upload wait for this one.
    const version = await findVersionById(tx, key, "no-key-update");
    if (version === null) {
      throw notFound();
    }
    if (version.status !== "DRAFT") {
      throw notAllowedInState("a file of a version that is not a draft");
    }
    if ((await findActiveFile(tx, version.id, languageCode)) !== null) {
      throw alreadyExists("the version has an active file of the language");
    }
    const storageKey = await storeBytes(version, languageCode, input.bytes);
    let file;
    try {
      file = await insertFile(tx, {
        documentVersionId: version.id,
        languageCode,
        storageKey,
        fileHash: checked.sha256,
        fileSizeBytes: input.bytes.byteLength,
        contentType: PDF_CONTENT_TYPE,
        originalFilename: input.originalFilename,
        now: now(),
      });
    } catch (error) {
      throw violatedConstraint(error) === ONE_ACTIVE_RULE ? alreadyExists("the version has an active file of the language") : error;
    }
    await recordAudit(tx, actor, {
      actionCode: "eifu.document_file.uploaded",
      entityType: "eifu_document_file",
      entityId: String(file.id),
      stateBefore: null,
      stateAfter: auditState(file),
    });
    return toFileView(file);
  });
}

/**
 * The file with the id and the version that holds it, the version locked for a
 * change. The lock order is the version first, then the file, as in the upload.
 *
 * @throws AppError `RES-4200`.
 */
async function lockFileWithVersion(executor: Executor, fileId: bigint): Promise<{ readonly file: FileRow; readonly version: VersionRow }> {
  const unlocked = await findFileById(executor, fileId);
  if (unlocked === null) {
    throw notFound();
  }
  const version = await findVersionById(executor, unlocked.documentVersionId, "no-key-update");
  const file = await findFileById(executor, fileId, "update");
  if (version === null || file === null) {
    throw notFound();
  }
  return { file, version };
}

/**
 * Removes a file of a `DRAFT` version by deactivation. The row stays (IFU-20.AC9).
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `RES-4200`;
 * `RES-4302` when the version is not `DRAFT`, or the file is inactive.
 */
export async function deactivateFile(actor: SessionActor, fileId: string): Promise<FileView> {
  requirePermission(actor, "eifu.document.manage");
  const key = requireEifuKey(fileId);
  return runTransaction(async (tx) => {
    const { file, version } = await lockFileWithVersion(tx, key);
    if (version.status !== "DRAFT") {
      throw notAllowedInState("a file of a version that is not a draft");
    }
    if (!file.isActive) {
      throw notAllowedInState("the file is inactive");
    }
    await markFileInactive(tx, file.id);
    const ended = { ...file, isActive: false };
    await recordAudit(tx, actor, {
      actionCode: "eifu.document_file.deactivated",
      entityType: "eifu_document_file",
      entityId: String(file.id),
      stateBefore: auditState(file),
      stateAfter: auditState(ended),
    });
    return toFileView(ended);
  });
}

/**
 * A signed URL for a stored file, valid for 5 minutes. The file downloads as an
 * attachment with the name `{documentNumber}-rev{revisionLabel}-{languageCode}.pdf`,
 * never with the name of the upload (DEC-076, DEC-093). An inactive file keeps its
 * object (DEC-124), so a manager can still download it.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200`;
 * `UP-5500`, `UP-5501` or `UP-5000` when the object store fails.
 */
export async function fileDownloadUrl(actor: SessionActor, fileId: string): Promise<string> {
  requirePermission(actor, "eifu.document.view");
  const executor = readExecutor();
  const file = await findFileById(executor, requireEifuKey(fileId));
  const version = file === null ? null : await findVersionById(executor, file.documentVersionId);
  const document = version === null ? null : await findDocumentById(executor, version.documentId);
  if (file === null || version === null || document === null) {
    throw notFound();
  }
  const attachmentName = `${document.documentNumber}-rev${version.revision}-${file.languageCode}.pdf`;
  return signedDownloadUrl(file.storageKey, { expiresInSeconds: DOWNLOAD_LINK_SECONDS, attachmentName });
}

/**
 * Replaces the active file of a `PUBLISHED` or `SUPERSEDED` version with a reason
 * (IFU-32.AC1, DEC-065). The new file is active, and the old file row and its
 * object stay. The replacement keeps the language of the old file. The change has
 * one replacement row and one audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.document.replace_published_file`;
 * `VAL-4001` for a blank reason (AC3); `VAL-4006` on `file` for bytes that are no
 * PDF, no bytes, a hash that differs, or the bytes of the file in force (AC2);
 * `RES-4200`; `RES-4302` when the version is `DRAFT` or `WITHDRAWN` (AC5), or the
 * file is inactive; `RES-4300` when the version already has a file with these
 * bytes in the language (the store never replaces an object, PLT-10.AC2). A
 * `languageCode` in the form is 400 `VAL-4007` before this function (AC4).
 */
export async function replacePublishedFile(actor: SessionActor, fileId: string, input: ReplacementInput): Promise<ReplacementResult> {
  requirePermission(actor, "eifu.document.replace_published_file");
  const reason = requireReason(input.reason);
  const checked = checkBytes(input);
  if (checked.faults.length > 0) {
    throw validationError(checked.faults);
  }
  const key = requireEifuKey(fileId);
  return runTransaction(async (tx) => {
    const { file: previous, version } = await lockFileWithVersion(tx, key);
    if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
      throw notAllowedInState("the replacement of a file of a version that is not published");
    }
    if (!previous.isActive) {
      throw notAllowedInState("the file is inactive");
    }
    if (checked.sha256 === previous.fileHash) {
      throw validationError([{ code: "VAL-4006", entry: { field: "file", issue: EIFU_ISSUES.sameBytes } }]);
    }
    if ((await findFileByContent(tx, version.id, previous.languageCode, checked.sha256)) !== null) {
      throw alreadyExists("the key of the file exists");
    }
    const storageKey = await storeBytes(version, previous.languageCode, input.bytes);
    const at = now();
    // The old file leaves first, so the new one takes the one active place of the language.
    await markFileInactive(tx, previous.id);
    let next;
    try {
      next = await insertFile(tx, {
        documentVersionId: version.id,
        languageCode: previous.languageCode,
        storageKey,
        fileHash: checked.sha256,
        fileSizeBytes: input.bytes.byteLength,
        contentType: PDF_CONTENT_TYPE,
        originalFilename: input.originalFilename,
        now: at,
      });
    } catch (error) {
      throw violatedConstraint(error) === ONE_ACTIVE_RULE ? alreadyExists("the version has an active file of the language") : error;
    }
    const replacement = await insertReplacement(tx, {
      documentVersionId: version.id,
      languageCode: previous.languageCode,
      previousFileId: previous.id,
      replacementFileId: next.id,
      previousFileHash: previous.fileHash,
      replacementFileHash: next.fileHash,
      replacedByUserId: BigInt(actor.userId),
      now: at,
      reason,
    });
    await recordAudit(tx, actor, {
      actionCode: "eifu.document_file.replaced",
      entityType: "eifu_document_file",
      entityId: String(next.id),
      stateBefore: { fileId: String(previous.id), fileHash: previous.fileHash },
      stateAfter: {
        fileId: String(next.id),
        fileHash: next.fileHash,
        replacementId: String(replacement.id),
        versionId: String(version.id),
        languageCode: next.languageCode,
      },
      reason,
    });
    return { file: toFileView(next), replacement: toReplacementView(replacement) };
  });
}
