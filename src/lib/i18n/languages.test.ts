import { describe, expect, it } from "vitest";

import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE_MAX_AGE_SECONDS, isLanguage, resolveLanguage } from "./languages";

// Source: DEC-017 and FND-08 AC2 to AC5.
describe("resolveLanguage", () => {
  it("is Turkish for a visitor without a cookie", () => {
    expect(resolveLanguage({ userPreferred: null, cookie: null })).toBe("tr");
    expect(DEFAULT_LANGUAGE).toBe("tr");
  });

  it("follows the cookie", () => {
    expect(resolveLanguage({ userPreferred: null, cookie: "en" })).toBe("en");
    expect(resolveLanguage({ userPreferred: null, cookie: "tr" })).toBe("tr");
  });

  it("ignores a cookie with an unknown value", () => {
    expect(resolveLanguage({ userPreferred: null, cookie: "de" })).toBe("tr");
    expect(resolveLanguage({ userPreferred: null, cookie: "EN" })).toBe("tr");
    expect(resolveLanguage({ userPreferred: null, cookie: "" })).toBe("tr");
  });

  it("gives the preference of a signed-in user priority over the cookie", () => {
    expect(resolveLanguage({ userPreferred: "en", cookie: "tr" })).toBe("en");
    expect(resolveLanguage({ userPreferred: "tr", cookie: "en" })).toBe("tr");
  });

  it("keeps the cookie for 365 days", () => {
    expect(LANGUAGE_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
  });

  it("knows the two languages only", () => {
    expect(["tr", "en", "de", "", null, 1].map((value) => isLanguage(value))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});
