/**
 * File storage (PLT-10, DEC-032, DEC-124, DEC-125).
 *
 * The key of a file holds record ids and the SHA-256 of the bytes, never a part
 * of the uploaded file name:
 * `documents/{documentId}/{versionId}/{languageCode}/{sha256}.pdf`. The language
 * code is a BCP 47 tag of up to 35 characters (DEC-069), in the canonical form
 * that the caller stores. A write never replaces an object (`If-None-Match: *`).
 * When the object store does not answer, the call fails with 503 `UP-5500`, and
 * the readiness probe is not affected (PLT-10.AC4).
 */
import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { faultsOf, validationError } from "@/lib/http/validation";

import { objectExists, putObjectIfAbsent, signGetUrl } from "../repositories/object-store-repository";

/** The characters of a language code that a key holds: the subtags of a BCP 47 tag, joined by hyphens (DEC-069). A subtag has 1 to 8 characters. */
const LANGUAGE_CODE_PATTERN = /^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;
const LANGUAGE_CODE_MAX = 35;

const DocumentFileIds = z.strictObject({
  documentId: z.string().regex(/^[1-9][0-9]{0,17}$/),
  versionId: z.string().regex(/^[1-9][0-9]{0,17}$/),
  languageCode: z.string().max(LANGUAGE_CODE_MAX).regex(LANGUAGE_CODE_PATTERN),
});
export type DocumentFileIds = z.infer<typeof DocumentFileIds>;

export interface StoredDocumentFile {
  readonly key: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

const KEY_PATTERN = /^documents\/[1-9][0-9]{0,17}\/[1-9][0-9]{0,17}\/(?=[^/]{1,35}\/)[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*\/[0-9a-f]{64}\.pdf$/;

/** A signed URL works for 15 minutes, unless the caller asks for less. */
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

export interface SignedDownloadOptions {
  /** How long the URL works. At most 15 minutes. */
  readonly expiresInSeconds?: number;
  /** The name of the download: the URL makes the store answer with `Content-Disposition: attachment` and this name (DEC-076). */
  readonly attachmentName?: string;
}

/**
 * The header `Content-Disposition` of a download. The name has a plain ASCII form
 * for an old client, and the percent-encoded UTF-8 form of RFC 6266 for the rest.
 * A control character, a quote and a backslash never reach the header.
 */
function attachmentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%;]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

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
export async function signedDownloadUrl(key: string, options: SignedDownloadOptions = {}): Promise<string> {
  if (!KEY_PATTERN.test(key) || !(await objectExists(key))) {
    throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
  }
  const expiresInSeconds = Math.min(options.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS, DEFAULT_SIGNED_URL_TTL_SECONDS);
  return signGetUrl(key, expiresInSeconds, options.attachmentName === undefined ? undefined : attachmentDisposition(options.attachmentName));
}
