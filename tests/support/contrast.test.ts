import { describe, expect, it } from "vitest";

import { measurePair, parseColor, scopeProperties } from "./contrast";

// Source: WCAG 2.2 (contrast ratio) and CSS Color 5 (color-mix). The reader that FND-09.AC2 uses.
const HEROUI = `@layer base {
  :root, .light, [data-theme="light"] { --background: #ffffff; --link: var(--accent); --accent: #0000ff; }
  .dark, [data-theme="dark"] { --background: #000000; }
}`;
const GLOBALS = `@import "tailwindcss";
:root { --accent: #767676; --mix: color-mix(in oklab, #000000 50%, transparent); }
@theme { --color-x: red; }
.region { --background: #222222; }`;

describe("the contrast reader", () => {
  it("gives 21:1 for black on white", () => {
    const properties = new Map([
      ["--background", "#ffffff"],
      ["--foreground", "#000000"],
    ]);
    const measure = measurePair(properties, { label: "x", foreground: "--foreground", background: "--background", minimum: 4.5 }, false);

    expect(measure.ratio).toBeCloseTo(21, 5);
  });

  it("lets unlayered rules win over layered ones, and substitutes var() where it is declared", () => {
    const light = scopeProperties({ heroui: HEROUI, globals: GLOBALS }, "light");

    expect(light.get("--accent")).toBe("#767676");
    expect(light.get("--link")).toBe("#767676");
    expect(light.get("--background")).toBe("#ffffff");
  });

  it("applies the dark theme and a scoped region", () => {
    expect(scopeProperties({ heroui: HEROUI, globals: GLOBALS }, "dark").get("--background")).toBe("#000000");
    expect(scopeProperties({ heroui: HEROUI, globals: GLOBALS }, "light", "region").get("--background")).toBe("#222222");
  });

  it("gives 4.54:1 for #767676 on white", () => {
    const properties = new Map([
      ["--background", "#ffffff"],
      ["--accent", "#767676"],
    ]);
    const measure = measurePair(properties, { label: "x", foreground: "--accent", background: "--background", minimum: 4.5 }, false);

    expect(measure.ratio).toBeCloseTo(4.54, 2);
  });

  it("mixes with transparent as a translucent color", () => {
    const mixed = parseColor("color-mix(in oklab, #000000 50%, transparent)");

    expect(mixed.alpha).toBeCloseTo(0.5, 5);
    expect(mixed.l).toBeCloseTo(0, 5);
  });
});
