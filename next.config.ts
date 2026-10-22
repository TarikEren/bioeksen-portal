import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./src/lib/security/headers";

// DEC-130: `cacheComponents` and `partialPrefetching` stay off. Partial
// Prerendering does not work with the nonce of the Content Security Policy
// (FND-07).
const nextConfig: NextConfig = {
  // The server does not tell which framework it runs.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // FND-07 rule 2: every answer carries these headers, an API answer and a file
  // of the build too. The Content Security Policy needs a nonce for each answer,
  // so `src/proxy.ts` sets it.
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: SECURITY_HEADERS.map(({ key, value }) => ({ key, value })) }]);
  },
};

export default nextConfig;
