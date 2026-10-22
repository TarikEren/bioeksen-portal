/**
 * The Content Security Policy of FND-07 rule 1 and its nonce. This file has no
 * dependency on the server, so `src/proxy.ts` can import it.
 */

/** A nonce that is new for each answer: 128 random bits, in base64 (FND-07 rule 1). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export interface ContentSecurityPolicyOptions {
  /**
   * Adds `'unsafe-eval'` to `script-src`. Only the development server needs it:
   * React uses `eval` there to rebuild server stacks in the browser. A production
   * answer never has it.
   */
  readonly development?: boolean;
}

/**
 * The value of `Content-Security-Policy` for an HTML answer.
 *
 * `script-src` holds `'self'` and the nonce, and neither `'unsafe-inline'` nor
 * (outside development) `'unsafe-eval'`. `style-src` holds `'self'` and
 * `'unsafe-inline'`, for the style attributes that React renders.
 * `frame-ancestors` is `'none'` (FND-07 rule 1).
 */
export function buildContentSecurityPolicy(nonce: string, options: ContentSecurityPolicyOptions = {}): string {
  const scriptSources = ["'self'", `'nonce-${nonce}'`];
  if (options.development === true) {
    scriptSources.push("'unsafe-eval'");
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
