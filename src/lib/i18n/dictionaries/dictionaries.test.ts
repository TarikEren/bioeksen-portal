import { describe, expect, it } from "vitest";

import { dictionaries } from ".";

/** Every leaf of a dictionary as a pair of its dotted key and its value. */
function leaves(value: object, prefix = ""): (readonly [string, unknown])[] {
  return Object.entries(value).flatMap(([key, child]): (readonly [string, unknown])[] => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof child === "object" && child !== null ? leaves(child, path) : [[path, child]];
  });
}

const keysOf = (dictionary: object): string[] => leaves(dictionary).map(([path]) => path).sort();

// Source: FND-08 rule 1 and AC1; the UI table of the stage B0 plan.
describe("dictionaries", () => {
  it("holds the same keys in Turkish and in English", () => {
    expect(keysOf(dictionaries.en)).toEqual(keysOf(dictionaries.tr));
  });

  it("holds the keys that the contract of stage B0 names", () => {
    expect(keysOf(dictionaries.tr)).toEqual(
      expect.arrayContaining(["common.language.en", "common.language.switch", "common.language.tr", "home.title"]),
    );
  });

  it("holds no empty text", () => {
    for (const dictionary of [dictionaries.tr, dictionaries.en]) {
      for (const [path, text] of leaves(dictionary)) {
        expect(typeof text === "string" && text.trim() !== "", path).toBe(true);
      }
    }
  });
});
