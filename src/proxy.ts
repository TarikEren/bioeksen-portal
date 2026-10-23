/**
 * The Next.js proxy (FND-07).
 *
 * For each HTML request it makes a nonce that is new for each answer, and sets
 * the Content Security Policy with that nonce on the request, so that Next.js
 * puts the nonce on its scripts, and on the answer. It also sets the headers of
 * FND-07 rule 2 and the request id.
 *
 * The matcher leaves out `/api`: a route handler sets its own headers, and the
 * proxy truncates a body over 10 MB. The proxy is never an authorization layer
 * (`sds-nextjs-backend` §3). The one decision it takes is the redirect of a
 * backoffice page without a session cookie to `/sign-in` (ACC-30.AC1).
 */
import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, parseSessionId } from "@/lib/auth/session";
import { isDevelopmentServer, isPublicBaseUrlSecure } from "@/lib/config";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-context/request-id";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";
import { applySecurityHeaders } from "@/lib/security/headers";

/** Whether the path is the backoffice or a page under it. `backoffice` is a whole path segment. */
function isBackofficePath(pathname: string): boolean {
  return pathname === "/backoffice" || pathname.startsWith("/backoffice/");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy(nonce, {
    development: isDevelopmentServer(),
    upgradeInsecureRequests: isPublicBaseUrlSecure(),
  });
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  // An optimistic check (ACC-30.AC1, `sds-nextjs-backend` §3): a person with no
  // session cookie goes to the sign-in page. The check does not look at the
  // session itself. The layout and the services decide who may see what.
  if (isBackofficePath(request.nextUrl.pathname) && parseSessionId(request.cookies.get(SESSION_COOKIE)?.value) === null) {
    const target = request.nextUrl.clone();
    target.pathname = "/sign-in";
    target.search = "";
    const redirect = NextResponse.redirect(target);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    applySecurityHeaders(redirect.headers);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  applySecurityHeaders(response.headers);
  return response;
}

// The proxy also runs for a prefetch of the browser (`Purpose: prefetch`,
// `Next-Router-Prefetch`). A request with such a header can get an HTML answer,
// and every HTML answer carries the policy (FND-07.AC1). An answer that is not
// HTML, the RSC payload, gets the policy too, which does no harm.
export const config = {
  matcher: [
    {
      // Everything except the API, the build files and the icon. `api` is a whole
      // path segment: a page such as /apis still gets its policy.
      source: "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico).*)",
    },
  ],
};
