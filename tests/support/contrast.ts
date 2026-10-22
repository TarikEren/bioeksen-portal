/**
 * The contrast table of the `sds-nextjs-frontend` reference page
 * (`references/ui-reference.html`), computed without a browser (FND-09.AC2).
 *
 * The reference page resolves each token in a browser and paints it on a
 * canvas. This module does the same steps in Node.js, so a unit test can read
 * `src/app/globals.css` as the app loads it:
 *
 * 1. The cascade of custom properties: HeroUI's default theme in `@layer base`,
 *    then the unlayered rules of `globals.css`, which win. Selector
 *    specificity and source order decide inside each layer. A custom property
 *    inherits its computed value, and `var()` is substituted on the element
 *    that declares the property.
 * 2. The colors: hexadecimal, `rgb()`/`rgba()`, `oklch()`, `transparent`, and
 *    `color-mix(in oklab, …)` with the percentage rules of CSS Color 5.
 * 3. The paint: each layer is drawn over the last on white, in 8-bit sRGB,
 *    as a canvas does. A color outside sRGB is clipped.
 * 4. The ratio of WCAG 2.2: (L1 + 0.05) / (L2 + 0.05), not rounded.
 *
 * The pairs, their minimums, the region rule (the page-level `--background`
 * pairs use `--surface` inside a scoped region) and the field-edge rule (a
 * border counts only when `--field-border-width` draws it) are copied from the
 * reference page, which FND-09.AC2 names as the source.
 */

// ---------------------------------------------------------------------------
// The pairs of the reference page: [label, foreground, background, minimum, drawn over].

export type PairForeground = string | readonly string[];

export interface ContrastPair {
  readonly label: string;
  readonly foreground: PairForeground;
  readonly background: string;
  readonly minimum: number;
  readonly over?: string;
}

export const REFERENCE_PAIRS: readonly ContrastPair[] = [
  { label: "Body text", foreground: "--foreground", background: "--background", minimum: 4.5 },
  { label: "Text on a surface", foreground: "--surface-foreground", background: "--surface", minimum: 4.5 },
  { label: "Muted text on the page", foreground: "--muted", background: "--background", minimum: 4.5 },
  { label: "Muted text on a surface", foreground: "--muted", background: "--surface", minimum: 4.5 },
  { label: "Link on the page", foreground: "--link", background: "--background", minimum: 4.5 },
  { label: "Link on a surface", foreground: "--link", background: "--surface", minimum: 4.5 },
  { label: "Accent text on the page", foreground: "--accent", background: "--background", minimum: 4.5 },
  { label: "Accent text on a surface", foreground: "--accent", background: "--surface", minimum: 4.5 },
  { label: "Primary button", foreground: "--accent-foreground", background: "--accent", minimum: 4.5 },
  { label: "Primary button, hovered", foreground: "--accent-foreground", background: "--accent-hover", minimum: 4.5 },
  { label: "Neutral button / chip", foreground: "--default-foreground", background: "--default", minimum: 4.5 },
  {
    label: "Soft accent chip",
    foreground: "--accent-soft-foreground",
    background: "--accent-soft",
    minimum: 4.5,
    over: "--surface",
  },
  { label: "Success, solid", foreground: "--success-foreground", background: "--success", minimum: 4.5 },
  {
    label: "Soft success chip",
    foreground: "--success-soft-foreground",
    background: "--success-soft",
    minimum: 4.5,
    over: "--surface",
  },
  { label: "Warning, solid", foreground: "--warning-foreground", background: "--warning", minimum: 4.5 },
  {
    label: "Soft warning chip",
    foreground: "--warning-soft-foreground",
    background: "--warning-soft",
    minimum: 4.5,
    over: "--surface",
  },
  { label: "Danger, solid", foreground: "--danger-foreground", background: "--danger", minimum: 4.5 },
  {
    label: "Soft danger chip",
    foreground: "--danger-soft-foreground",
    background: "--danger-soft",
    minimum: 4.5,
    over: "--surface",
  },
  { label: "Error text on a surface (FieldError)", foreground: "--danger", background: "--surface", minimum: 4.5 },
  { label: "Field text", foreground: "--field-foreground", background: "--field-background", minimum: 4.5 },
  { label: "Placeholder", foreground: "--field-placeholder", background: "--field-background", minimum: 4.5 },
  { label: "Focus ring on the page", foreground: "--focus", background: "--background", minimum: 3 },
  { label: "Focus ring on a surface", foreground: "--focus", background: "--surface", minimum: 3 },
  {
    label: "Field edge vs. the surface (a drawn border, or the fill)",
    foreground: ["--field-border", "--field-background"],
    background: "--surface",
    minimum: 3,
  },
];

// ---------------------------------------------------------------------------
// CSS: the rules that declare custom properties.

interface Rule {
  readonly selectors: readonly string[];
  readonly layered: boolean;
  readonly order: number;
  readonly declarations: ReadonlyMap<string, string>;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The index of the brace that closes the block opened at `open`. */
function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("A CSS block is not closed.");
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseDeclarations(body: string): Map<string, string> {
  // Nested blocks are not declarations of this rule.
  let flat = "";
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "{") {
      index = closingBrace(body, index);
      continue;
    }
    flat += body[index];
  }
  const declarations = new Map<string, string>();
  for (const part of splitTopLevel(flat, ";")) {
    const colon = part.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const name = part.slice(0, colon).trim();
    const value = part
      .slice(colon + 1)
      .replace(/\s+/g, " ")
      .trim();
    if (name.startsWith("--")) {
      declarations.set(name, value);
    }
  }
  return declarations;
}

class RuleCollector {
  readonly rules: Rule[] = [];
  private order = 0;

  add(css: string, layered: boolean): void {
    const text = stripComments(css);
    let index = 0;
    while (index < text.length) {
      const brace = text.indexOf("{", index);
      const semicolon = text.indexOf(";", index);
      if (brace < 0) {
        return;
      }
      if (semicolon >= 0 && semicolon < brace) {
        // A statement such as @import or @layer a, b;
        index = semicolon + 1;
        continue;
      }
      const prelude = text.slice(index, brace).trim();
      const close = closingBrace(text, brace);
      const body = text.slice(brace + 1, close);
      index = close + 1;
      if (prelude.startsWith("@layer")) {
        this.add(body, true);
      } else if (prelude.startsWith("@")) {
        // @theme is Tailwind-only, and the browser ignores it; @media, @supports
        // and @keyframes hold no token of the reference page.
        continue;
      } else {
        const declarations = parseDeclarations(body);
        if (declarations.size > 0) {
          this.rules.push({
            selectors: splitTopLevel(prelude, ",").map((selector) => selector.trim()),
            layered,
            order: this.order,
            declarations,
          });
          this.order += 1;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Selectors: the compound selectors the two files use, on one element.

export interface ElementModel {
  readonly isRoot: boolean;
  readonly tag: string;
  readonly classes: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
}

type Specificity = readonly [number, number, number];

const NO_MATCH = null;

/** The specificity of the selector when it matches the element, else null. */
function matchCompound(selector: string, element: ElementModel): Specificity | null {
  if (/[\s>+~]/.test(selector.replace(/\([^)]*\)|\[[^\]]*\]/g, ""))) {
    // A combinator: no rule of the two files needs one for these elements.
    return NO_MATCH;
  }
  let rest = selector;
  let classes = 0;
  let tags = 0;
  while (rest.length > 0) {
    let match: RegExpExecArray | null;
    if ((match = /^:root/.exec(rest)) !== null) {
      if (!element.isRoot) return NO_MATCH;
      classes += 1;
    } else if ((match = /^:host(\([^)]*\))?/.exec(rest)) !== null) {
      return NO_MATCH;
    } else if ((match = /^:not\(([^)]*)\)/.exec(rest)) !== null) {
      const inner = match[1] ?? "";
      if (matchCompound(inner, element) !== null) return NO_MATCH;
      // The specificity of :not() is the specificity of its argument.
      classes += (inner.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length;
    } else if ((match = /^\.([\w-]+)/.exec(rest)) !== null) {
      if (!element.classes.includes(match[1] ?? "")) return NO_MATCH;
      classes += 1;
    } else if ((match = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(rest)) !== null) {
      const name = match[1] ?? "";
      const expected = match[2];
      const actual = element.attributes[name];
      if (actual === undefined || (expected !== undefined && actual !== expected)) return NO_MATCH;
      classes += 1;
    } else if ((match = /^[a-z][\w-]*/i.exec(rest)) !== null) {
      if (match[0].toLowerCase() !== element.tag) return NO_MATCH;
      tags += 1;
    } else {
      throw new Error(`The selector "${selector}" has a form this reader does not know.`);
    }
    rest = rest.slice(match[0].length);
  }
  return [0, classes, tags];
}

function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// ---------------------------------------------------------------------------
// The computed custom properties of an element.

export type ComputedProperties = ReadonlyMap<string, string>;

function winningDeclarations(rules: readonly Rule[], element: ElementModel): Map<string, string> {
  const candidates: { layered: boolean; specificity: Specificity; order: number; declarations: ReadonlyMap<string, string> }[] = [];
  for (const rule of rules) {
    let best: Specificity | null = null;
    for (const selector of rule.selectors) {
      const specificity = matchCompound(selector, element);
      if (specificity !== null && (best === null || compareSpecificity(specificity, best) > 0)) {
        best = specificity;
      }
    }
    if (best !== null) {
      candidates.push({ layered: rule.layered, specificity: best, order: rule.order, declarations: rule.declarations });
    }
  }
  // Ascending precedence: layered before unlayered, then specificity, then order.
  candidates.sort(
    (a, b) =>
      Number(!a.layered) - Number(!b.layered) || compareSpecificity(a.specificity, b.specificity) || a.order - b.order,
  );
  const result = new Map<string, string>();
  for (const candidate of candidates) {
    for (const [name, value] of candidate.declarations) {
      result.set(name, value);
    }
  }
  return result;
}

/** Substitutes `var(--name, fallback)` in a value, with the element's own properties. */
function substitute(value: string, lookup: (name: string) => string | undefined): string | undefined {
  const start = value.indexOf("var(");
  if (start < 0) {
    return value;
  }
  let depth = 0;
  let end = -1;
  for (let index = start + 3; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end < 0) return undefined;
  const inner = value.slice(start + 4, end);
  const comma = splitTopLevel(inner, ",");
  const name = (comma[0] ?? "").trim();
  const fallback = comma.length > 1 ? comma.slice(1).join(",").trim() : undefined;
  let replacement = lookup(name);
  if (replacement === undefined && fallback !== undefined) {
    replacement = substitute(fallback, lookup);
  }
  if (replacement === undefined) return undefined;
  return substitute(value.slice(0, start) + replacement + value.slice(end + 1), lookup);
}

/** The computed custom properties of an element under its parent. */
export function computeProperties(
  rules: readonly Rule[],
  element: ElementModel,
  parent: ComputedProperties = new Map(),
): ComputedProperties {
  const declared = winningDeclarations(rules, element);
  const computed = new Map<string, string>(parent);
  for (const name of declared.keys()) {
    computed.delete(name);
  }
  const resolving = new Set<string>();
  const resolve = (name: string): string | undefined => {
    if (!declared.has(name)) {
      return computed.get(name);
    }
    if (computed.has(name)) {
      return computed.get(name);
    }
    if (resolving.has(name)) {
      return undefined; // A cycle makes the property invalid.
    }
    resolving.add(name);
    const raw = declared.get(name) ?? "";
    const value = substitute(raw, resolve);
    resolving.delete(name);
    if (value !== undefined) {
      computed.set(name, value);
    }
    return value;
  };
  for (const name of declared.keys()) {
    resolve(name);
  }
  return computed;
}

// ---------------------------------------------------------------------------
// Colors.

/** A color in OKLab with alpha. Lightness 0 to 1. */
interface OkLab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
  readonly alpha: number;
}

const toLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel: number): number =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

function srgbToOklab(r: number, g: number, b: number, alpha: number): OkLab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha,
  };
}

/** sRGB channels 0 to 1, clipped. */
function oklabToSrgb(color: OkLab): readonly [number, number, number] {
  const l = (color.l + 0.3963377774 * color.a + 0.2158037573 * color.b) ** 3;
  const m = (color.l - 0.1055613458 * color.a - 0.0638541728 * color.b) ** 3;
  const s = (color.l - 0.0894841775 * color.a - 1.291485548 * color.b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const clip = (value: number): number => Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, value)))));
  return [clip(linear[0] ?? 0), clip(linear[1] ?? 0), clip(linear[2] ?? 0)];
}

function parseNumber(text: string, percentScale: number): number {
  const trimmed = text.trim();
  if (trimmed.endsWith("%")) {
    return (Number.parseFloat(trimmed) / 100) * percentScale;
  }
  return Number.parseFloat(trimmed.replace(/deg$/, ""));
}

function functionArguments(value: string, name: string): string | null {
  const prefix = `${name}(`;
  if (!value.startsWith(prefix) || !value.endsWith(")")) return null;
  return value.slice(prefix.length, -1);
}

/** Parses a CSS color into OKLab. */
export function parseColor(raw: string): OkLab {
  const value = raw.trim().toLowerCase();
  if (value === "transparent") {
    return { l: 0, a: 0, b: 0, alpha: 0 };
  }
  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex !== null) {
    const digits = hex[1] ?? "";
    const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits;
    const channel = (offset: number): number => Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return srgbToOklab(channel(0), channel(2), channel(4), full.length === 8 ? channel(6) : 1);
  }
  const rgb = functionArguments(value, "rgba") ?? functionArguments(value, "rgb");
  if (rgb !== null) {
    const parts = rgb.split(/[\s,/]+/).filter((part) => part !== "");
    const [r, g, b] = parts.slice(0, 3).map((part) => parseNumber(part, 255) / 255);
    const alpha = parts[3] === undefined ? 1 : parseNumber(parts[3], 1);
    return srgbToOklab(r ?? 0, g ?? 0, b ?? 0, alpha);
  }
  const oklch = functionArguments(value, "oklch");
  if (oklch !== null) {
    const [lightness, chroma, hue, alpha] = oklch.split(/[\s/]+/).filter((part) => part !== "");
    const l = parseNumber(lightness ?? "0", 1);
    const c = parseNumber(chroma ?? "0", 0.4);
    const h = (parseNumber(hue ?? "0", 360) * Math.PI) / 180;
    return { l, a: c * Math.cos(h), b: c * Math.sin(h), alpha: alpha === undefined ? 1 : parseNumber(alpha, 1) };
  }
  const mix = functionArguments(value, "color-mix");
  if (mix !== null) {
    return parseColorMix(mix);
  }
  throw new Error(`The color "${raw}" has a form this reader does not know.`);
}

/** `color-mix(in oklab, A p%, B q%)`, CSS Color 5 §2. */
function parseColorMix(argumentsText: string): OkLab {
  const [space, first, second] = splitTopLevel(argumentsText, ",").map((part) => part.trim());
  if (space !== "in oklab" || first === undefined || second === undefined) {
    throw new Error(`color-mix(${argumentsText}) is not a two-color mix in oklab.`);
  }
  const component = (text: string): { color: OkLab; percent: number | undefined } => {
    const match = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(text);
    return {
      color: parseColor(match?.[1] ?? text),
      percent: match?.[2] === undefined ? undefined : Number.parseFloat(match[2]),
    };
  };
  const a = component(first);
  const b = component(second);
  let p1 = a.percent;
  let p2 = b.percent;
  if (p1 === undefined && p2 === undefined) {
    p1 = 50;
    p2 = 50;
  } else if (p1 === undefined) {
    p1 = 100 - (p2 ?? 0);
  } else if (p2 === undefined) {
    p2 = 100 - p1;
  }
  const sum = (p1 ?? 0) + (p2 ?? 0);
  const multiplier = sum < 100 ? sum / 100 : 1;
  const w1 = (p1 ?? 0) / sum;
  const w2 = (p2 ?? 0) / sum;
  const alpha = a.color.alpha * w1 + b.color.alpha * w2;
  if (alpha === 0) {
    return { l: 0, a: 0, b: 0, alpha: 0 };
  }
  // Premultiplied interpolation.
  const channel = (x: number, y: number): number => (x * a.color.alpha * w1 + y * b.color.alpha * w2) / alpha;
  return {
    l: channel(a.color.l, b.color.l),
    a: channel(a.color.a, b.color.a),
    b: channel(a.color.b, b.color.b),
    alpha: alpha * multiplier,
  };
}

// ---------------------------------------------------------------------------
// Paint and ratio.

type Pixel = readonly [number, number, number];

/** Draws each color over the last, on white, in 8-bit sRGB (a 1x1 canvas). */
function paint(stack: readonly OkLab[]): Pixel {
  let pixel: Pixel = [255, 255, 255];
  for (const color of stack) {
    const [r, g, b] = oklabToSrgb(color).map((channel) => channel * 255);
    const alpha = Math.min(1, Math.max(0, color.alpha));
    pixel = [
      Math.round((r ?? 0) * alpha + pixel[0] * (1 - alpha)),
      Math.round((g ?? 0) * alpha + pixel[1] * (1 - alpha)),
      Math.round((b ?? 0) * alpha + pixel[2] * (1 - alpha)),
    ];
  }
  return pixel;
}

function luminance([r, g, b]: Pixel): number {
  const lin = (value: number): number => toLinear(value / 255);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The WCAG 2.2 contrast ratio of two pixels. */
export function contrastRatio(first: Pixel, second: Pixel): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const toHex = (pixel: Pixel): string => `#${pixel.map((value) => value.toString(16).padStart(2, "0")).join("")}`;

// ---------------------------------------------------------------------------
// Scopes and measures.

export interface Measure {
  readonly pair: ContrastPair;
  /** The ratio, or null when a token is not defined. */
  readonly ratio: number | null;
  readonly foregroundHex: string;
  readonly backgroundHex: string;
  readonly note: string;
}

export interface Stylesheets {
  /** HeroUI's default theme (`@heroui/styles`, `themes/default/variables.css`). */
  readonly heroui: string;
  /** The app's `src/app/globals.css`. */
  readonly globals: string;
}

export type Theme = "light" | "dark";

/** The custom properties of the page scope or of a scoped region, in a theme. */
export function scopeProperties(sheets: Stylesheets, theme: Theme, regionClass?: string): ComputedProperties {
  const collector = new RuleCollector();
  collector.add(sheets.heroui, false);
  collector.add(sheets.globals, false);
  const root: ElementModel = {
    isRoot: true,
    tag: "html",
    classes: [],
    attributes: theme === "dark" ? { "data-theme": "dark" } : {},
  };
  const rootProperties = computeProperties(collector.rules, root);
  const body = computeProperties(collector.rules, { isRoot: false, tag: "body", classes: [], attributes: {} }, rootProperties);
  const scope: ElementModel = {
    isRoot: false,
    tag: "div",
    classes: regionClass === undefined ? [] : [regionClass],
    attributes: {},
  };
  return computeProperties(collector.rules, scope, body);
}

function fieldBorderWidth(properties: ComputedProperties): number {
  const own = properties.get("--field-border-width")?.trim() ?? "";
  const fallback = properties.get("--border-width")?.trim() ?? "";
  const width = Number.parseFloat(own !== "" ? own : fallback !== "" ? fallback : "0");
  return Number.isNaN(width) ? 0 : width;
}

/** Measures one pair in a scope, as the reference page does. */
export function measurePair(properties: ComputedProperties, pair: ContrastPair, inRegion: boolean): Measure {
  if (typeof pair.foreground !== "string") {
    const measures = pair.foreground.map((foreground) => measurePair(properties, { ...pair, foreground }, inRegion));
    const defined = measures.filter((measure) => measure.ratio !== null);
    const best = defined.reduce<Measure | undefined>(
      (current, measure) => (current === undefined || (measure.ratio ?? 0) > (current.ratio ?? 0) ? measure : current),
      undefined,
    );
    return best === undefined ? { ...(measures[0] ?? notDefined(pair)), pair } : { ...best, pair };
  }
  const local = (name: string): string => (inRegion && name === "--background" ? "--surface" : name);
  const foreground = local(pair.foreground);
  const background = local(pair.background);
  const color = (name: string): OkLab | undefined => {
    const value = properties.get(name);
    return value === undefined || value.trim() === "" ? undefined : parseColor(value);
  };
  const base = color(local("--background"));
  const fg = color(foreground);
  const bg = color(background);
  if (fg === undefined || bg === undefined || base === undefined) {
    return notDefined(pair);
  }
  const stack: OkLab[] = [base];
  if (pair.over !== undefined) {
    const over = color(pair.over);
    if (over !== undefined) stack.push(over);
  }
  stack.push(bg);
  const backgroundPixel = paint(stack);
  if (foreground === "--field-border" && fieldBorderWidth(properties) <= 0) {
    return {
      pair,
      ratio: 1,
      foregroundHex: toHex(backgroundPixel),
      backgroundHex: toHex(backgroundPixel),
      note: "border not drawn: --field-border-width is 0",
    };
  }
  const foregroundPixel = paint([...stack, fg]);
  return {
    pair,
    ratio: contrastRatio(foregroundPixel, backgroundPixel),
    foregroundHex: toHex(foregroundPixel),
    backgroundHex: toHex(backgroundPixel),
    note: foreground === "--field-border" ? "via the border" : foreground === "--field-background" ? "via the fill" : "",
  };
}

function notDefined(pair: ContrastPair): Measure {
  return { pair, ratio: null, foregroundHex: "", backgroundHex: "", note: "not defined" };
}

/** Measures every pair of the reference page in a scope. */
export function measureAll(properties: ComputedProperties, inRegion: boolean): Measure[] {
  return REFERENCE_PAIRS.map((pair) => measurePair(properties, pair, inRegion));
}

/** The pairs below their minimum, one line each, for a failure message. */
export function failures(measures: readonly Measure[]): string[] {
  return measures
    .filter((measure) => measure.ratio === null || measure.ratio < measure.pair.minimum)
    .map((measure) =>
      measure.ratio === null
        ? `${measure.pair.label}: a token is not defined`
        : `${measure.pair.label}: ${measure.ratio.toFixed(2)}:1, needs ${String(measure.pair.minimum)}:1 ` +
          `(${measure.foregroundHex} on ${measure.backgroundHex}${measure.note === "" ? "" : `, ${measure.note}`})`,
    );
}
