/**
 * FND-01 Repository and toolchain: AC2, AC3, AC4, the import rules of the
 * code layout (core.md, **Code layout**; `sds-nextjs-backend` §1).
 *
 * Each case writes two fixture files into a copy of the repository that
 * differ only in one import: an allowed import, which must pass
 * `pnpm run lint`, and the forbidden import, which must fail it. So the
 * failure comes from the import and from nothing else in the fixture. The
 * imported modules exist in the copy, so a rule that resolves imports finds
 * them.
 */
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type RepositoryCopy, copyRepository, tail } from "../support/repo-copy";

const CATALOG_REPOSITORY = "src/modules/catalog/repositories/qa-fixture-repository.ts";
const CATALOG_SERVICE = "src/modules/catalog/services/qa-fixture-service.ts";
const LIB_HELPER = "src/lib/qa-fixture/qa-fixture-helper.ts";

let copy: RepositoryCopy;

beforeAll(() => {
  copy = copyRepository({ linkNodeModules: true });
  copy.write(CATALOG_REPOSITORY, 'export function findQaFixture(): string {\n  return "qa";\n}\n');
  copy.write(
    CATALOG_SERVICE,
    'import { findQaFixture } from "@/modules/catalog/repositories/qa-fixture-repository";\n\n' +
      "export function readQaFixture(): string {\n  return findQaFixture();\n}\n",
  );
  copy.write(LIB_HELPER, 'export const qaFixtureHelper = "qa";\n');
});

afterAll(() => {
  copy.remove();
});

function pageSource(importLine: string, name: string): string {
  return `${importLine}\n\nexport default function QaFixturePage() {\n  return <p>{${name}()}</p>;\n}\n`;
}

function moduleSource(importLine: string, name: string): string {
  return `${importLine}\n\nexport function qaFixture(): string {\n  return String(${name});\n}\n`;
}

async function lint(file: string): Promise<{ code: number | null; text: string }> {
  const result = await copy.pnpm(["run", "lint", file]);
  return { code: result.code, text: tail(result, 60) };
}

/**
 * Lints the allowed fixture (it must pass) and the forbidden fixture (it must
 * fail and name the file).
 */
async function expectImportRule(
  allowed: { file: string; text: string },
  forbidden: { file: string; text: string },
): Promise<{ code: number | null; text: string }> {
  copy.write(allowed.file, allowed.text);
  copy.write(forbidden.file, forbidden.text);

  const control = await lint(allowed.file);
  expect(control.code, `precondition: the same file with an allowed import passes lint\n${control.text}`).toBe(0);

  const result = await lint(forbidden.file);
  expect(result.code, `pnpm run lint fails on ${forbidden.file}\n${result.text}`).not.toBe(0);
  return result;
}

function namesFile(output: string, file: string): boolean {
  const normalized = output.replace(/\\/g, "/");
  return normalized.includes(file) || normalized.includes(path.posix.join(...file.split("/").slice(1)));
}

describe("FND-01 import rules", () => {
  /** A file under src/app that imports a repository fails lint, and lint names the file. */
  it("FND-01.AC2: lint fails and names the file when a file under src/app imports a repository", async () => {
    const forbidden = "src/app/qa-fixture-repository-import/page.tsx";
    const result = await expectImportRule(
      {
        file: "src/app/qa-fixture-service-import/page.tsx",
        text: pageSource('import { readQaFixture } from "@/modules/catalog/services/qa-fixture-service";', "readQaFixture"),
      },
      {
        file: forbidden,
        text: pageSource(
          'import { findQaFixture } from "@/modules/catalog/repositories/qa-fixture-repository";',
          "findQaFixture",
        ),
      },
    );
    expect(namesFile(result.text, forbidden), `the lint output names ${forbidden}\n${result.text}`).toBe(true);
  });

  /** The rule also holds for a relative import path. */
  it("FND-01.AC2: lint fails and names the file when a file under src/app imports a repository by a relative path", async () => {
    const forbidden = "src/app/qa-fixture-relative-import/page.tsx";
    const result = await expectImportRule(
      {
        file: "src/app/qa-fixture-relative-service/page.tsx",
        text: pageSource('import { readQaFixture } from "../../modules/catalog/services/qa-fixture-service";', "readQaFixture"),
      },
      {
        file: forbidden,
        text: pageSource(
          'import { findQaFixture } from "../../modules/catalog/repositories/qa-fixture-repository";',
          "findQaFixture",
        ),
      },
    );
    expect(namesFile(result.text, forbidden), `the lint output names ${forbidden}\n${result.text}`).toBe(true);
  });

  /** A file of one module that imports a repository of another module fails lint, and lint names the file. */
  it("FND-01.AC3: lint fails and names the file when one module imports a repository of another module", async () => {
    const forbidden = "src/modules/eifu/services/qa-fixture-cross-repository.ts";
    const result = await expectImportRule(
      {
        file: "src/modules/eifu/services/qa-fixture-cross-service.ts",
        text: moduleSource('import { readQaFixture } from "@/modules/catalog/services/qa-fixture-service";', "readQaFixture"),
      },
      {
        file: forbidden,
        text: moduleSource(
          'import { findQaFixture } from "@/modules/catalog/repositories/qa-fixture-repository";',
          "findQaFixture",
        ),
      },
    );
    expect(namesFile(result.text, forbidden), `the lint output names ${forbidden}\n${result.text}`).toBe(true);
  });

  /** The rule forbids only another module's repository: a module's own service may import its own repository. */
  it("FND-01.AC3: lint accepts a module that imports its own repository", async () => {
    const file = "src/modules/catalog/services/qa-fixture-own-repository.ts";
    copy.write(
      file,
      moduleSource('import { findQaFixture } from "@/modules/catalog/repositories/qa-fixture-repository";', "findQaFixture"),
    );
    const result = await lint(file);

    expect(result.code, `pnpm run lint passes on ${file}\n${result.text}`).toBe(0);
  });

  /** The rule also holds for a relative import path. */
  it("FND-01.AC3: lint fails and names the file when one module imports a repository of another module by a relative path", async () => {
    const forbidden = "src/modules/eifu/services/qa-fixture-relative-cross-repository.ts";
    const result = await expectImportRule(
      {
        file: "src/modules/eifu/services/qa-fixture-relative-cross-service.ts",
        text: moduleSource('import { readQaFixture } from "../../catalog/services/qa-fixture-service";', "readQaFixture"),
      },
      {
        file: forbidden,
        text: moduleSource('import { findQaFixture } from "../../catalog/repositories/qa-fixture-repository";', "findQaFixture"),
      },
    );
    expect(namesFile(result.text, forbidden), `the lint output names ${forbidden}\n${result.text}`).toBe(true);
  });

  /** The rule also holds for a relative import path. */
  it("FND-01.AC4: lint fails when a file under src/lib imports a file under src/modules by a relative path", async () => {
    await expectImportRule(
      {
        file: "src/lib/qa-fixture/qa-fixture-relative-lib-import.ts",
        text: moduleSource('import { qaFixtureHelper } from "./qa-fixture-helper";', "qaFixtureHelper"),
      },
      {
        file: "src/lib/qa-fixture/qa-fixture-relative-module-import.ts",
        text: moduleSource('import { readQaFixture } from "../../modules/catalog/services/qa-fixture-service";', "readQaFixture"),
      },
    );
  });

  /** A file under src/lib that imports a file under src/modules fails lint. */
  it("FND-01.AC4: lint fails when a file under src/lib imports a file under src/modules", async () => {
    await expectImportRule(
      {
        file: "src/lib/qa-fixture/qa-fixture-lib-import.ts",
        text: moduleSource('import { qaFixtureHelper } from "@/lib/qa-fixture/qa-fixture-helper";', "qaFixtureHelper"),
      },
      {
        file: "src/lib/qa-fixture/qa-fixture-module-import.ts",
        text: moduleSource('import { readQaFixture } from "@/modules/catalog/services/qa-fixture-service";', "readQaFixture"),
      },
    );
  });
});
