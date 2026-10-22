/**
 * The protection of the identity of a public lookup (IFU-90, DEC-081, DEC-089,
 * DEC-071).
 *
 * - `encryptIdentity` and `decryptIdentity` use AES-256-GCM with the key ring of
 *   `EIFU_IDENTITY_KEYS` (`id:base64key`, newest first). A write uses the first
 *   key and returns its id, and the row keeps the id. A read uses the key that
 *   the row names (IFU-90 rule 3). Each call has a new random nonce. The id of
 *   the key is the additional authenticated data, so a cipher text moved to a row
 *   with another key id does not open.
 * - `lookupHash` is the HMAC-SHA-256 of the lower-case email address with
 *   `EIFU_IDENTITY_LOOKUP_PEPPER` (IFU-90 rule 4). The pepper never changes
 *   (DEC-089). An erasure finds the access records of a person with it.
 * - `hashVerificationCode` is a keyed hash of the code of a verification
 *   (DEC-071). The system never stores the code itself.
 *
 * Only the services of the e-IFU module call these functions. No function here
 * logs, and none puts a value in an error message. A missing setting is `CFG-5000`;
 * in production the app does not report ready without both settings (IFU-90 rule 5).
 *
 * The key ring and the pepper are parameters with the settings as the default, so
 * a unit test passes its own values.
 */
import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { VERIFICATION_CODE_LENGTH } from "@/lib/schemas/lookup";

/** The nonce of AES-GCM is 96 bits. */
const NONCE_BYTES = 12;
/** The tag of AES-GCM is 128 bits. */
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** One key of the ring. */
export interface IdentityKey {
  readonly id: string;
  readonly key: Buffer;
}

/** The result of an encryption: the row stores `cipher` and `keyId`. */
export interface EncryptedIdentity {
  /** `nonce` (12 bytes), then the cipher text, then the tag (16 bytes). */
  readonly cipher: Buffer;
  /** The id of the key that encrypted the value. */
  readonly keyId: string;
}

/**
 * Reads the key ring text of `EIFU_IDENTITY_KEYS`. The configuration module
 * checks the form at start, so a text that fails here is a defect of the
 * environment.
 *
 * @throws AppError `CFG-5001` for an entry that is not `id:base64key` of 32 bytes.
 */
export function parseKeyRing(text: string): readonly IdentityKey[] {
  const ring = text.split(",").map((entry): IdentityKey => {
    const part = entry.trim();
    const separator = part.indexOf(":");
    const key = Buffer.from(part.slice(separator + 1), "base64");
    if (separator <= 0 || key.length !== KEY_BYTES) {
      throw new AppError("CFG-5001", "Configuration value invalid", { reason: "EIFU_IDENTITY_KEYS has an entry that is not usable" });
    }
    return { id: part.slice(0, separator), key };
  });
  return ring;
}

/**
 * The key ring of the settings, newest key first.
 *
 * @throws AppError `CFG-5000` when `EIFU_IDENTITY_KEYS` is not set.
 */
function configuredKeyRing(): readonly IdentityKey[] {
  const text = getConfig().EIFU_IDENTITY_KEYS;
  if (text === undefined) {
    throw new AppError("CFG-5000", "Required configuration missing", { reason: "EIFU_IDENTITY_KEYS is not set" });
  }
  return parseKeyRing(text);
}

/**
 * @throws AppError `CFG-5000` when `EIFU_IDENTITY_LOOKUP_PEPPER` is not set.
 */
function configuredPepper(): string {
  const pepper = getConfig().EIFU_IDENTITY_LOOKUP_PEPPER;
  if (pepper === undefined) {
    throw new AppError("CFG-5000", "Required configuration missing", { reason: "EIFU_IDENTITY_LOOKUP_PEPPER is not set" });
  }
  return pepper;
}

/**
 * Encrypts an identity value (an email address or a client address) with the
 * first key of the ring.
 *
 * @throws AppError `CFG-5000` when the ring is not set.
 */
export function encryptIdentity(value: string, ring: readonly IdentityKey[] = configuredKeyRing()): EncryptedIdentity {
  const [newest] = ring;
  if (newest === undefined) {
    throw new AppError("CFG-5000", "Required configuration missing", { reason: "the identity key ring is empty" });
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", newest.key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(newest.id, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { cipher: Buffer.concat([nonce, encrypted, cipher.getAuthTag()]), keyId: newest.id };
}

/**
 * Decrypts an identity value with the key that the row names (IFU-90 rule 3).
 * The caller is the one audited path that reads an identity (DEC-081).
 *
 * @throws AppError `CFG-5001` when the ring has no key with that id, `SYS-5000` when the cipher text does not open.
 */
export function decryptIdentity(
  cipher: Uint8Array,
  keyId: string,
  ring: readonly IdentityKey[] = configuredKeyRing(),
): string {
  const entry = ring.find((candidate) => candidate.id === keyId);
  if (entry === undefined) {
    throw new AppError("CFG-5001", "Configuration value invalid", { reason: "the key ring has no key with the id of the row" });
  }
  const bytes = Buffer.from(cipher);
  if (bytes.length < NONCE_BYTES + TAG_BYTES) {
    throw new AppError("SYS-5000", "Unhandled error", { reason: "the identity cipher text is too short" });
  }
  const nonce = bytes.subarray(0, NONCE_BYTES);
  const tag = bytes.subarray(bytes.length - TAG_BYTES);
  const body = bytes.subarray(NONCE_BYTES, bytes.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", entry.key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(entry.id, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch (error) {
    throw new AppError("SYS-5000", "Unhandled error", { reason: "the identity cipher text does not open", cause: error });
  }
}

/**
 * The lookup hash of an email address: HMAC-SHA-256 of the lower-case address
 * with the pepper, in lowercase hexadecimal (IFU-90 rule 4).
 *
 * @throws AppError `CFG-5000` when the pepper is not set.
 */
export function lookupHash(email: string, pepper: string = configuredPepper()): string {
  return createHmac("sha256", pepper).update(email.toLowerCase(), "utf8").digest("hex");
}

/** A random code of six digits, with leading zeros (DEC-070). */
export function generateVerificationCode(): string {
  return randomInt(0, 10 ** VERIFICATION_CODE_LENGTH).toString().padStart(VERIFICATION_CODE_LENGTH, "0");
}

/**
 * The keyed hash of a verification code (DEC-071). The key comes from the pepper
 * with a fixed label, so the hash of a code and the lookup hash of an email
 * address never share a key. The id of the verification is in the message, so the
 * same code of two verifications gives two hashes.
 *
 * @throws AppError `CFG-5000` when the pepper is not set.
 */
export function hashVerificationCode(verificationId: string, code: string, pepper: string = configuredPepper()): string {
  const key = createHmac("sha256", pepper).update("eifu.verification-code.v1", "utf8").digest();
  return createHmac("sha256", key).update(`${verificationId}:${code}`, "utf8").digest("hex");
}

/** Whether a code gives the stored hash. The comparison takes the same time for every code. */
export function verificationCodeMatches(
  storedHash: string,
  verificationId: string,
  code: string,
  pepper: string = configuredPepper(),
): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashVerificationCode(verificationId, code, pepper), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
