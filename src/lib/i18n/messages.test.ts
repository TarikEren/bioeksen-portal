import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/lib/errors";

import { dictionaries } from "./dictionaries";
import { fmt, textForCode } from "./messages";

// Source: FND-08 rule 1; sds-nextjs-frontend §6 (placeholders go through the project formatter).
describe("fmt", () => {
  it("fills a placeholder", () => {
    expect(fmt("Hata kodu: {code}", { code: "SYS-5000" })).toBe("Hata kodu: SYS-5000");
  });

  it("fills a placeholder that appears twice, and a number", () => {
    expect(fmt("{n}/{n} {unit}", { n: 3, unit: "kB" })).toBe("3/3 kB");
  });

  it("does not read the braces of a value as a placeholder", () => {
    expect(fmt("Kod: {code}", { code: "{code}" })).toBe("Kod: {code}");
  });

  it("throws when a placeholder has no value, also for a name of Object.prototype", () => {
    expect(() => fmt("Kod: {code}", {})).toThrow(RangeError);
    expect(() => fmt("Kod: {toString}", {})).toThrow(RangeError);
  });

  it("leaves a text with no placeholder as it is", () => {
    expect(fmt("Dil değiştirilemedi.", {})).toBe("Dil değiştirilemedi.");
  });
});

describe("textForCode", () => {
  const texts = { "VAL-4002": "known" };

  it("returns the text of a known code", () => {
    expect(textForCode(texts, "VAL-4002", "fallback")).toBe("known");
  });

  it("returns the fallback for an unknown code, also for a name of Object.prototype", () => {
    expect(textForCode(texts, "DB-5000", "fallback")).toBe("fallback");
    expect(textForCode(texts, "toString", "fallback")).toBe("fallback");
  });
});

// Source: DEC-122 (the text of a failure is by code); sds-nextjs-frontend §6.
describe("the message dictionaries", () => {
  it.each(["tr", "en"] as const)("%s: the template of the error code names {code} and nothing else", (language) => {
    const template = dictionaries[language].common.errorCode;
    expect(fmt(template, { code: "SYS-5000" })).toContain("SYS-5000");
    expect(template.match(/\{[^}]*\}/g)).toEqual(["{code}"]);
  });

  it.each(["tr", "en"] as const)("%s: every key of the map of failures is a code of the registry", (language) => {
    const known: readonly string[] = ERROR_CODES;
    for (const code of Object.keys(dictionaries[language].common.errors)) {
      expect(known, code).toContain(code);
    }
  });
});
