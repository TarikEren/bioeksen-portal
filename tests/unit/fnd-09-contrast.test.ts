/**
 * FND-09 Interface base: AC2, the contrast table of the `sds-nextjs-frontend`
 * reference page, read from `src/app/globals.css` (DEC-015, DEC-018).
 *
 * `tests/support/contrast.ts` computes the table as the reference page does:
 * HeroUI's default theme under the app's stylesheet, every pair of the page,
 * and the minimums of WCAG 2.2 level AA that the page gives each pair.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type Theme, failures, measureAll, scopeProperties } from "../support/contrast";
import { repositoryRoot } from "../support/paths";

const sheets = {
  heroui: readFileSync(
    path.join(repositoryRoot, "node_modules", "@heroui", "styles", "dist", "themes", "default", "variables.css"),
    "utf8",
  ),
  globals: readFileSync(path.join(repositoryRoot, "src", "app", "globals.css"), "utf8"),
};

const REGION_CLASS = "sidebar-theme";

describe("FND-09 contrast of globals.css", () => {
  for (const theme of ["light", "dark"] as const satisfies readonly Theme[]) {
    /** Each pair of the reference page meets its WCAG 2.2 AA minimum in this theme. */
    it(`FND-09.AC2: each pair of the ${theme} theme meets the WCAG 2.2 AA minimum`, () => {
      const below = failures(measureAll(scopeProperties(sheets, theme), false));

      expect(below, `pairs of the ${theme} theme below their minimum`).toEqual([]);
    });
  }

  for (const theme of ["light", "dark"] as const satisfies readonly Theme[]) {
    /** Each pair of the reference page meets its WCAG 2.2 AA minimum inside the region .sidebar-theme. */
    it(`FND-09.AC2: each pair of the region .sidebar-theme meets the WCAG 2.2 AA minimum, in the ${theme} theme`, () => {
      const below = failures(measureAll(scopeProperties(sheets, theme, REGION_CLASS), true));

      expect(below, `pairs of .${REGION_CLASS} in the ${theme} theme below their minimum`).toEqual([]);
    });
  }
});
