/**
 * FND-08 Languages and formats: AC1, the type of `en.ts` comes from `tr.ts`
 * (FND-08 rule 1, `sds-nextjs-frontend` §6).
 *
 * The test adds a key to the `home` section of `tr.ts` in a copy of the
 * repository, and leaves `en.ts` as it is. It finds the section with the
 * TypeScript parser, so it does not depend on the layout of the file.
 */
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type RepositoryCopy, copyRepository, tail } from "../support/repo-copy";

const TURKISH = "src/lib/i18n/dictionaries/tr.ts";
const NEW_KEY = "qaOnlyInTurkish";

/** The source of tr.ts with one more key in the object of `home`. */
function withExtraKey(source: string): string {
  const file = ts.createSourceFile(TURKISH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let insertAt: number | undefined;
  const visit = (node: ts.Node): void => {
    if (insertAt !== undefined) return;
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "home"
    ) {
      let initializer: ts.Expression = node.initializer;
      while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
        initializer = initializer.expression;
      }
      if (ts.isObjectLiteralExpression(initializer)) {
        insertAt = initializer.getStart(file) + 1;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (insertAt === undefined) {
    throw new Error(`${TURKISH} has no object for the section "home".`);
  }
  return `${source.slice(0, insertAt)}\n  ${NEW_KEY}: "Yalnız Türkçe",${source.slice(insertAt)}`;
}

describe("FND-08 dictionaries", () => {
  let copy: RepositoryCopy;

  beforeAll(() => {
    copy = copyRepository({ linkNodeModules: true });
  });

  afterAll(() => {
    copy.remove();
  });

  /** A key in tr.ts and not in en.ts makes pnpm run typecheck fail. */
  it("FND-08.AC1: pnpm run typecheck fails when a key is in tr.ts and not in en.ts", async () => {
    const control = await copy.pnpm(["run", "typecheck"]);
    expect(control.code, `precondition: the copy type checks with the dictionaries as they are\n${tail(control)}`).toBe(0);

    copy.write(TURKISH, withExtraKey(copy.read(TURKISH)));
    const result = await copy.pnpm(["run", "typecheck"]);

    expect(result.code, tail(result)).not.toBe(0);
    expect(result.output, "the type error names the missing key").toContain(NEW_KEY);
  });
});
