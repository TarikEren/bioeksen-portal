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
 * (`sds-nextjs-backend` §3).
 */
import { type NextRequest, NextResponse } from "next/server";

import { isDevelopmentServer } from "@/lib/config";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-context/request-id";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";
import { applySecurityHeaders } from "@/lib/security/headers";

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy(nonce, { development: isDevelopmentServer() });
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

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

export const config = {
  matcher: [
    {
      // Everything except the API, the build files and the icon.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
