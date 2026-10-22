/**
 * The headers of FND-07, as plain data, so `next.config.ts` and the code of a
 * route read one list. This file imports nothing.
 *
 * FND-07 rule 2: every answer carries these, an API answer too.
 */

export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

/** The year of `Strict-Transport-Security`, in seconds (FND-07 rule 2). */
export const HSTS_MAX_AGE_SECONDS = 31_536_000;

export const SECURITY_HEADERS: readonly SecurityHeader[] = [
  { key: "Strict-Transport-Security", value: `max-age=${String(HSTS_MAX_AGE_SECONDS)}` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

/** Sets the headers of FND-07 rule 2 on an answer. */
export function applySecurityHeaders(headers: Headers): void {
  for (const { key, value } of SECURITY_HEADERS) {
    headers.set(key, value);
  }
}
