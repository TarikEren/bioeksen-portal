/**
 * The secrets of the module: the token of an invitation or a reset link, and
 * the session id (ACC-10 rule 2, DEC-123, DEC-024).
 *
 * A secret is a random 256-bit value as base64url. The database and Redis keep
 * only its SHA-256, so a read of the store gives nobody a working link or a
 * working cookie.
 */
import { createHash, randomBytes } from "node:crypto";

/** DEC-123: an invitation link works for 14 days, and a reset link for 1 hour. */
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** DEC-025: a session ends after 60 minutes without a request, and after 12 hours in total. */
export const SESSION_IDLE_MS = 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

/** A random 256-bit value as base64url: 43 characters. */
export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The SHA-256 of a secret, as hex. The stores keep this value and never the secret. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
