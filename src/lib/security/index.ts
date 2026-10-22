/**
 * Request security (FND-07, DEC-038).
 *
 * The Content Security Policy with its nonce, the headers of every answer, the
 * origin check, and the source address of a request. `proxy.ts` calls the
 * first two, and it is not an authorization layer (`sds-nextjs-backend` §3).
 */
import "server-only";

export { buildContentSecurityPolicy, generateNonce } from "./csp";
export type { ContentSecurityPolicyOptions } from "./csp";
export { SECURITY_HEADERS, applySecurityHeaders } from "./headers";
export type { SecurityHeader } from "./headers";
export { isAllowedOrigin, resolveForwardedSource, resolveSourceAddress } from "./origin";
