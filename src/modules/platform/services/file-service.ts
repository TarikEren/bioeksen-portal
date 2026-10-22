/**
 * File storage (PLT-10, DEC-032, DEC-124, DEC-125).
 *
 * The key of a file holds record ids and the SHA-256 of the bytes, never a part
 * of the uploaded file name:
 * `documents/{documentId}/{versionId}/{languageCode}/{sha256}.pdf`. A write
 * never replaces an object (`If-None-Match: *`). When the object store does not
 * answer, the call fails with 503 `UP-5500`, and the readiness probe is not
 * affected (PLT-10.AC4). No page uses these functions in stage B1.
 */
import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { faultsOf, validationError } from "@/lib/http/validation";

import { objectExists, putObjectIfAbsent, signGetUrl } from "../repositories/object-store-repository";

const DocumentFileIds = z.strictObject({
  documentId: z.string().regex(/^[1-9][0-9]{0,17}$/),
  versionId: z.string().regex(/^[1-9][0-9]{0,17}$/),
  languageCode: z.string().regex(/^[a-z]{2}$/),
});
export type DocumentFileIds = z.infer<typeof DocumentFileIds>;

export interface StoredDocumentFile {
  readonly key: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

const KEY_PATTERN = /^documents\/[1-9][0-9]{0,17}\/[1-9][0-9]{0,17}\/[a-z]{2}\/[0-9a-f]{64}\.pdf$/;

/** A signed URL works for 15 minutes. */
const SIGNED_URL_TTL_SECONDS = 900;

/**
 * Stores the bytes of a document file.
 *
 * @throws AppError `VAL-4006` for ids of a wrong form; `RES-4300` when the key
 * exists, and the stored object stays the same (PLT-10.AC2); `UP-5500`,
 * `UP-5501` or `UP-5000` when the object store fails.
 */
export async function storeDocumentFile(ids: DocumentFileIds, bytes: Uint8Array): Promise<StoredDocumentFile> {
  const parsed = DocumentFileIds.safeParse(ids);
  if (!parsed.success) {
    throw validationError(faultsOf(ids, parsed.error.issues));
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { documentId, versionId, languageCode } = parsed.data;
  const key = `documents/${documentId}/${versionId}/${languageCode}/${sha256}.pdf`;
  if ((await putObjectIfAbsent(key, bytes, "application/pdf")) === "exists") {
    throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the key exists" });
  }
  return { key, sha256, sizeBytes: bytes.byteLength };
}

/**
 * A signed download URL for a stored file. The caller authorizes the person for
 * the file before it calls this function (DEC-125). The URL starts with the
 * public endpoint of the store (DEC-132).
 *
 * @throws AppError `RES-4200` when the key has a wrong form or names no object;
 * `UP-5500`, `UP-5501` or `UP-5000` when the object store fails.
 */
export async function signedDownloadUrl(key: string): Promise<string> {
  if (!KEY_PATTERN.test(key) || !(await objectExists(key))) {
    throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
  }
  return signGetUrl(key, SIGNED_URL_TTL_SECONDS);
}
