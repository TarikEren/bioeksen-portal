/**
 * The check of a download URL before it goes into `href` (`sds-nextjs-frontend`
 * §2, DEC-076).
 *
 * The URL comes from the server, and it is a signed storage URL. The page still
 * lets only a relative URL, `http:` and `https:` through, so that a
 * `javascript:` or a `data:` URL can never reach the link. This file is pure.
 */

const ABSOLUTE_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** The URL when it is safe for `href`, else `null`. */
export function safeDownloadHref(url: string): string | null {
  if (!ABSOLUTE_SCHEME.test(url)) {
    // A relative URL has no scheme. A protocol-relative URL (`//host`) goes to
    // another host, so it is not accepted.
    return url.startsWith("/") && !url.startsWith("//") ? url : null;
  }
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
