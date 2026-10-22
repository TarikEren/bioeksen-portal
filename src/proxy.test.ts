import { describe, expect, it } from "vitest";

import { config } from "./proxy";

const [matcher] = config.matcher;
const source = matcher?.source ?? "";
// Next.js reads the source with path-to-regexp. This pattern is a plain regular expression.
const pattern = new RegExp(`^${source}$`);

// Source: FND-07 rule 1; proxy.md (matcher); review 1, R-022.
describe("the matcher of the proxy", () => {
  it("matches the pages", () => {
    for (const path of ["/", "/lookup", "/apis", "/api-docs", "/apiary/x", "/en/page"]) {
      expect(pattern.test(path), path).toBe(true);
    }
  });

  it("leaves out /api and everything under it", () => {
    for (const path of ["/api", "/api/health", "/api/v1/logs/batch"]) {
      expect(pattern.test(path), path).toBe(false);
    }
  });

  it("leaves out the build files and the icon", () => {
    for (const path of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) {
      expect(pattern.test(path), path).toBe(false);
    }
  });
});
