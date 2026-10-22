/**
 * Builds the worker process and the bootstrap command (PLT-30, ACC-40):
 * `pnpm run build:worker`, output in `.next/worker/`. That folder is not in the
 * source tree, so no linter or type check reads the bundle.
 *
 * The two entry points are not part of the Next.js build, so they need a build
 * of their own: it resolves the `@/` paths of `tsconfig.json` and writes one
 * ES module for each entry point. The packages stay external, so the image
 * needs its production `node_modules` beside the bundle.
 *
 * The code marks its server modules with `import "server-only"`. In a plain
 * Node.js process that import fails, because the package expects a bundler to
 * pick the `react-server` condition. The commands of `package.json` start the
 * bundle with `--conditions=react-server`, which makes the import empty.
 *
 * This file is a script of the repository, not part of the app.
 */
import path from "node:path";

import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..", "..");

await build({
  absWorkingDir: root,
  entryPoints: {
    main: "src/worker/main.ts",
    bootstrap: "src/worker/bootstrap.ts",
  },
  outdir: ".next/worker",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
