import { describe, expect, it } from "vitest";

import { resolveRequestId } from "./request-id";

// Source: sds-logging/references/log-record.md, X-Request-Id; contract-tests.md, Correlation.
describe("resolveRequestId", () => {
  it("adopts a well-formed id of the caller", () => {
    expect(resolveRequestId("abc123")).toBe("abc123");
    expect(resolveRequestId("8c21f3a94e7b1d05")).toBe("8c21f3a94e7b1d05");
    expect(resolveRequestId("a".repeat(128))).toBe("a".repeat(128));
  });

  it("makes a new id when the header is absent", () => {
    const id = resolveRequestId(null);

    expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(resolveRequestId(null)).not.toBe(id);
  });

  it("replaces a malformed id instead of failing", () => {
    for (const malformed of ["", "has space", "semi;colon", "new\nline", "a".repeat(129), "ünicode", "<script>"]) {
      const id = resolveRequestId(malformed);

      expect(id).not.toBe(malformed);
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    }
  });
});
