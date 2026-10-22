/**
 * The input of a file upload and of a file replacement, from the fields of the
 * form (DEC-092, IFU-20 rule 1, IFU-32). The two route handlers call it, so the
 * two entries read the form in one way. The service never sees a `File`.
 *
 * The route wrapper counts the body as it arrives and refuses a body over 20 MiB
 * with 413 `VAL-4550` before this code runs (IFU-20.AC3). The check of the file
 * size here is the second guard.
 */
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import {
  FILE_BODY_LIMIT_BYTES,
  type FileUploadFields,
  type FileUploadInput,
  ORIGINAL_FILENAME_MAX,
  type ReplacementFields,
  type ReplacementInput,
  type UploadedFile,
} from "@/lib/schemas/eifu";

/** The name of the upload, as information (IFU-20 rule 5): empty is none, and a long name is cut. */
function originalFilenameOf(file: File): string | null {
  return file.name === "" ? null : file.name.slice(0, ORIGINAL_FILENAME_MAX);
}

async function readUploadedFile(file: File, declaredSha256: string | undefined): Promise<UploadedFile> {
  if (file.size > FILE_BODY_LIMIT_BYTES) {
    throw new AppError("VAL-4550", CODE_MEANINGS["VAL-4550"]);
  }
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    originalFilename: originalFilenameOf(file),
    declaredSha256: declaredSha256 === undefined ? null : declaredSha256.toLowerCase(),
  };
}

/** @throws AppError `VAL-4550` when the file is over 20 MiB. */
export async function toFileUploadInput(fields: FileUploadFields): Promise<FileUploadInput> {
  return { languageCode: fields.languageCode.trim(), ...(await readUploadedFile(fields.file, fields.sha256)) };
}

/** @throws AppError `VAL-4550` when the file is over 20 MiB. */
export async function toReplacementInput(fields: ReplacementFields): Promise<ReplacementInput> {
  return { reason: fields.reason, ...(await readUploadedFile(fields.file, fields.sha256)) };
}
