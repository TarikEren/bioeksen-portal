/**
 * The paths that several helpers share.
 *
 * Vitest loads the helpers as ES modules and Playwright as CommonJS, so the
 * root is found from the working directory, not from `import.meta`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function findRoot(start: string): string {
  let directory = path.resolve(start);
  for (;;) {
    const manifest = path.join(directory, "package.json");
    if (existsSync(manifest) && existsSync(path.join(directory, "tests", "support"))) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
      if (typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "name") === "bioeksen-portal") {
        return directory;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`No bioeksen-portal repository above ${start}. Run the tests from the repository.`);
    }
    directory = parent;
  }
}

/** The root of the repository. */
export const repositoryRoot = findRoot(process.cwd());
