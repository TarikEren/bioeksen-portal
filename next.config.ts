import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./src/lib/security/headers";

// DEC-130: `cacheComponents` and `partialPrefetching` stay off. Partial
// Prerendering does not work with the nonce of the Content Security Policy
// (FND-07).
const nextConfig: NextConfig = {
  // The container image (`Dockerfile`) carries the standalone output: a server
  // and only the files that it traces, with no `node_modules` install (sds-ci,
  // **The container image**).
  output: "standalone",
  // The server does not tell which framework it runs.
  poweredByHeader: false,
  // CAT-60, DEC-051: the form of a LOT import takes a file of 5 MiB. The limit
  // counts the bytes of the multipart parts too, so the action also checks the
  // size of the file itself (`toLotImportInput`).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
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
