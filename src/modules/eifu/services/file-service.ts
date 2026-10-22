/**
 * The files of a version (IFU-20) and the replacement of a published file
 * (IFU-32).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * writes one audit row (PLT-40). The system deletes no file row and no stored
 * object (DEC-010, DEC-124). The service reads the type from the bytes (IFU-20
 * rule 2) and calculates the SHA-256 itself (IFU-20 rule 3).
 *
 * MOCK: IFU-20, IFU-32. The functions read and write the mock store, and keep no
 * bytes. Step 4 stores the bytes with `storeDocumentFile` of PLT-10 (the key of
 * PLT-10 rule 3, `If-None-Match: *`) in the transaction of the change, and signs
 * the URL with `signedDownloadUrl`.
 */
import "server-only";

import { createHash } from "node:crypto";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { type FieldFault, validationError } from "@/lib/http/validation";
import { type MockFile, getEifuMock, storageKeyOf } from "@/lib/mock/eifu";
import {
  EIFU_ISSUES,
  type FileUploadInput,
  type FileView,
  PDF_CONTENT_TYPE,
  type ReplacementInput,
  type ReplacementResult,
  type UploadedFile,
} from "@/lib/schemas/eifu";

import { isLanguageCode } from "../domain/language-code";
import { isPdf } from "../domain/pdf";
import {
  alreadyExists,
  documentOfVersion,
  filesOfVersion,
  notAllowedInState,
  recordAudit,
  requireFile,
  requireReason,
  requireVersion,
  toFileView,
  toReplacementView,
} from "./eifu-views";

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
function auditState(file: MockFile): Record<string, unknown> {
  return {
    versionId: file.versionId,
    languageCode: file.languageCode,
    fileHash: file.fileHash,
    fileSizeBytes: file.fileSizeBytes,
    isActive: file.isActive,
  };
}

/** Adds a new file row to the mock store. */
function addFile(upload: UploadedFile, versionId: string, languageCode: string, sha256: string): MockFile {
  const state = getEifuMock();
  const version = requireVersion(versionId);
  const file: MockFile = {
    id: String(state.nextFileId),
    versionId,
    languageCode,
    storageKey: storageKeyOf(version.documentId, versionId, languageCode, sha256),
    fileHash: sha256,
    fileSizeBytes: upload.bytes.byteLength,
    contentType: PDF_CONTENT_TYPE,
    originalFilename: upload.originalFilename,
    isActive: true,
    createdAt: now(),
  };
  state.nextFileId += 1;
  state.files.set(file.id, file);
  return file;
}

/**
 * Uploads a PDF to a `DRAFT` version (IFU-20.AC1). The upload has one audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `VAL-4006` on
 * `file` for bytes that are no PDF, no bytes, or a hash that differs (AC2, AC7,
 * AC8), and on `languageCode` for a tag that is not BCP 47 (AC6); `RES-4200`;
 * `RES-4302` when the version is not `DRAFT` (AC5); `RES-4300` when the version
 * has an active file of the language (AC4).
 */
export async function uploadFile(actor: SessionActor, versionId: string, input: FileUploadInput): Promise<FileView> {
  requirePermission(actor, "eifu.document.manage");
  const faults: FieldFault[] = [];
  if (!isLanguageCode(input.languageCode)) {
    faults.push({ code: "VAL-4006", entry: { field: "languageCode", issue: EIFU_ISSUES.languageCodeInvalid } });
  }
  const checked = checkBytes(input);
  faults.push(...checked.faults);
  if (faults.length > 0) {
    throw validationError(faults);
  }
  // MOCK: IFU-20 (store the object, insert the row)
  const version = requireVersion(versionId);
  if (version.status !== "DRAFT") {
    throw notAllowedInState("a file of a version that is not a draft");
  }
  // A language code is a BCP 47 tag, so two tags that differ only in case name one language.
  const language = input.languageCode.toLowerCase();
  if (filesOfVersion(version.id).some((file) => file.isActive && file.languageCode.toLowerCase() === language)) {
    throw alreadyExists("the version has an active file of the language");
  }
  const file = addFile(input, version.id, input.languageCode, checked.sha256);
  recordAudit(actor, {
    actionCode: "eifu.document_file.uploaded",
    entityType: "eifu_document_file",
    entityId: file.id,
    stateBefore: null,
    stateAfter: auditState(file),
  });
  return toFileView(file);
}

/**
 * Removes a file of a `DRAFT` version by deactivation. The row stays (IFU-20.AC9).
 *
 * @throws AppError `PERM-4150` without `eifu.document.manage`; `RES-4200`;
 * `RES-4302` when the version is not `DRAFT`, or the file is inactive.
 */
export async function deactivateFile(actor: SessionActor, fileId: string): Promise<FileView> {
  requirePermission(actor, "eifu.document.manage");
  // MOCK: IFU-20 (deactivate)
  const file = requireFile(fileId);
  if (requireVersion(file.versionId).status !== "DRAFT") {
    throw notAllowedInState("a file of a version that is not a draft");
  }
  if (!file.isActive) {
    throw notAllowedInState("the file is inactive");
  }
  const before = auditState(file);
  file.isActive = false;
  recordAudit(actor, {
    actionCode: "eifu.document_file.deactivated",
    entityType: "eifu_document_file",
    entityId: file.id,
    stateBefore: before,
    stateAfter: auditState(file),
  });
  return toFileView(file);
}

/**
 * A signed URL for a stored file, valid for 5 minutes. The file downloads as an
 * attachment with the name `{documentNumber}-rev{revisionLabel}-{languageCode}.pdf`,
 * never with the name of the upload (DEC-076, DEC-093). An inactive file keeps its
 * object (DEC-124), so a manager can still download it.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200`.
 */
export async function fileDownloadUrl(actor: SessionActor, fileId: string): Promise<string> {
  requirePermission(actor, "eifu.document.view");
  // MOCK: IFU-20 (the signed URL of the object store)
  const file = requireFile(fileId);
  const version = requireVersion(file.versionId);
  const attachmentName = `${documentOfVersion(version).documentNumber}-rev${version.revision}-${file.languageCode}.pdf`;
  const expires = Math.floor(now().getTime() / 1000) + 300;
  const disposition = encodeURIComponent(`attachment; filename="${attachmentName}"`);
  return `https://storage.mock.invalid/${file.storageKey}?response-content-disposition=${disposition}&expires=${String(expires)}`;
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
  // MOCK: IFU-32 (store the object, insert the rows)
  const previous = requireFile(fileId);
  const version = requireVersion(previous.versionId);
  if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
    throw notAllowedInState("the replacement of a file of a version that is not published");
  }
  if (!previous.isActive) {
    throw notAllowedInState("the file is inactive");
  }
  if (checked.sha256 === previous.fileHash) {
    throw validationError([{ code: "VAL-4006", entry: { field: "file", issue: EIFU_ISSUES.sameBytes } }]);
  }
  if (filesOfVersion(version.id).some((file) => file.languageCode === previous.languageCode && file.fileHash === checked.sha256)) {
    throw alreadyExists("the key of the file exists");
  }
  const state = getEifuMock();
  const next = addFile(input, version.id, previous.languageCode, checked.sha256);
  previous.isActive = false;
  const replacement = {
    id: String(state.nextReplacementId),
    versionId: version.id,
    languageCode: previous.languageCode,
    previousFileId: previous.id,
    replacementFileId: next.id,
    previousFileHash: previous.fileHash,
    replacementFileHash: next.fileHash,
    replacedByUserId: actor.userId,
    replacedAt: now(),
    reason,
  };
  state.nextReplacementId += 1;
  state.replacements.set(replacement.id, replacement);
  recordAudit(actor, {
    actionCode: "eifu.document_file.replaced",
    entityType: "eifu_document_file",
    entityId: next.id,
    stateBefore: { fileId: previous.id, fileHash: previous.fileHash },
    stateAfter: {
      fileId: next.id,
      fileHash: next.fileHash,
      replacementId: replacement.id,
      versionId: version.id,
      languageCode: next.languageCode,
    },
    reason,
  });
  return { file: toFileView(next), replacement: toReplacementView(replacement) };
}
