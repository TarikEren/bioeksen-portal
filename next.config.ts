import type { NextConfig } from "next";

// DEC-130: `cacheComponents` and `partialPrefetching` stay off. Partial
// Prerendering does not work with the nonce of the Content Security Policy
// (FND-07).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
