/**
 * Request security (FND-07, DEC-038).
 *
 * The Content Security Policy with its nonce, the headers of every answer, the
 * origin check, and the source address of a request.
 *
 * Skeleton of stage B0: the names and the signatures. Every body throws
 * `NotImplemented`. `proxy.ts` is the caller of the first three, and it is not
 * an authorization layer (`sds-nextjs-backend` §3).
 */
import "server-only";

import { NotImplemented } from "@/lib/errors";

/** A nonce that is new for each answer (FND-07 rule 1). */
export function generateNonce(): string {
  throw new NotImplemented("generateNonce");
}

/**
 * The value of `Content-Security-Policy` for an HTML answer.
 *
 * `script-src` holds `'self'` and the nonce, and neither `'unsafe-inline'` nor
 * `'unsafe-eval'`. `style-src` holds `'self'` and `'unsafe-inline'`.
 * `frame-ancestors` is `'none'` (FND-07 rule 1).
 */
export function buildContentSecurityPolicy(nonce: string): string {
  void nonce;
  throw new NotImplemented("buildContentSecurityPolicy");
}

/** Sets the headers of FND-07 rule 2 on an answer (HSTS, `nosniff`, `Referrer-Policy`). */
export function applySecurityHeaders(headers: Headers): void {
  void headers;
  throw new NotImplemented("applySecurityHeaders");
}

/**
 * Whether the `Origin` of a state-changing request is the origin of
 * `PUBLIC_BASE_URL` (FND-07 rule 3). A missing `Origin` is not allowed.
 */
export function isAllowedOrigin(origin: string | null, publicBaseUrl: string): boolean {
  void origin;
  void publicBaseUrl;
  throw new NotImplemented("isAllowedOrigin");
}

/**
 * The source address of a request: the rightmost `X-Forwarded-For` entry that a
 * proxy in `trustedProxies` did not add (DEC-038). Never the leftmost entry.
 *
 * @returns `null` when no address is known.
 */
export function resolveSourceAddress(
  forwardedFor: string | null,
  connectionAddress: string | null,
  trustedProxies: readonly string[],
): string | null {
  void forwardedFor;
  void connectionAddress;
  void trustedProxies;
  throw new NotImplemented("resolveSourceAddress");
}
