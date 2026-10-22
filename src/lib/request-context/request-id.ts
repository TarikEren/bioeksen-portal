/**
 * The request id (`log-record.md`, **`X-Request-Id`**). This file has no
 * dependency on the server, so `src/proxy.ts` can import it.
 */

export const REQUEST_ID_HEADER = "X-Request-Id";

/** The form of a request id that the app adopts: `[A-Za-z0-9_-]`, 1 to 128 characters. */
const REQUEST_ID_FORMAT = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Adopts the request id of the caller, or makes a new one.
 *
 * A value that is absent or malformed gives a new id. It never fails the
 * request. A new id is a UUID v4, which has 122 bits of entropy. The id is
 * opaque: it is echoed and logged, and never used to authorize, address a
 * resource or build a query.
 */
export function resolveRequestId(headerValue: string | null): string {
  if (headerValue !== null && REQUEST_ID_FORMAT.test(headerValue)) {
    return headerValue;
  }
  return crypto.randomUUID();
}
