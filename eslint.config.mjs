import path from "node:path";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The import rules of the layout (FND-01 rule 3, `docs/specs/core.md` > Code
 * layout, DEC-004) and the layers of `sds-nextjs-backend` §1.
 *
 * The rule works on the import text and the path of the linted file. It does
 * not need the file system, so it also lints a file that does not exist yet.
 * It resolves the alias `@/` (`./src/`) and a relative path to a path under
 * `src/`, and then it applies these rules:
 *
 * 1. A file under `src/app/` never imports a repository.
 * 2. A file of one module never imports a repository of another module.
 * 3. A file under `src/lib/` never imports a file under `src/modules/`.
 * 4. A file under `src/app/` or under a service never imports the database
 *    client (`src/lib/db`): only a repository does.
 */
const layerRules = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      appToRepository:
        "{{file}} is under src/app/ and imports the repository '{{target}}'. A route, an action or a page calls a service (FND-01.AC2).",
      moduleToForeignRepository:
        "{{file}} is in the module '{{from}}' and imports the repository '{{target}}' of the module '{{to}}'. Use the service of '{{to}}' (FND-01.AC3, DEC-004).",
      libToModule:
        "{{file}} is under src/lib/ and imports '{{target}}' under src/modules/. The shared code never depends on a module (FND-01.AC4).",
      clientAboveRepository:
        "{{file}} imports the database client '{{target}}'. Only a repository imports it (sds-nextjs-backend section 1).",
    },
  },
  create(context) {
    const toPosix = (value) => value.split(path.sep).join("/");
    const file = toPosix(path.relative(context.cwd, context.filename));

    /** The path of an import under `src/`, or `null` when it points elsewhere. */
    const resolveTarget = (specifier) => {
      if (specifier.startsWith("@/")) {
        return `src/${specifier.slice(2)}`;
      }
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      }
      return null;
    };

    const fileModule = /^src\/modules\/([^/]+)\//.exec(file)?.[1] ?? null;
    const inApp = file.startsWith("src/app/");
    const inLib = file.startsWith("src/lib/");
    const inService = /^src\/modules\/[^/]+\/services\//.test(file);

    const check = (node, specifier) => {
      if (typeof specifier !== "string") {
        return;
      }
      const target = resolveTarget(specifier);
      if (target === null) {
        return;
      }
      const repository = /^src\/modules\/([^/]+)\/repositories(\/|$)/.exec(target);
      const data = { file, target: specifier };

      if (inApp && repository !== null) {
        context.report({ node, messageId: "appToRepository", data });
      }
      if (fileModule !== null && repository !== null && repository[1] !== fileModule) {
        context.report({
          node,
          messageId: "moduleToForeignRepository",
          data: { ...data, from: fileModule, to: repository[1] },
        });
      }
      if (inLib && /^src\/modules(\/|$)/.test(target)) {
        context.report({ node, messageId: "libToModule", data });
      }
      if ((inApp || inService) && /^src\/lib\/db(\/|$|\.)/.test(target)) {
        context.report({ node, messageId: "clientAboveRepository", data });
      }
    };

    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportAllDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => {
        if (node.source) {
          check(node.source, node.source.value);
        }
      },
      ImportExpression: (node) => {
        if (node.source.type === "Literal") {
          check(node.source, node.source.value);
        }
      },
      CallExpression: (node) => {
        const [first] = node.arguments;
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          first !== undefined &&
          first.type === "Literal"
        ) {
          check(first, first.value);
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    plugins: { layers: { rules: { "import-layers": layerRules } } },
    rules: { "layers/import-layers": "error" },
  },
  {
    // FND-03 rule 1: only the configuration module reads `process.env`. The
    // scripts under `src/scripts/` are tooling of the repository, not the app.
    files: ["src/**/*.{ts,tsx,mts}"],
    ignores: ["src/lib/config/**", "src/scripts/**", "src/instrumentation.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: "Only src/lib/config reads process.env (FND-03 rule 1, sds-config).",
        },
      ],
    },
  },
  {
    // The start hook reads the runtime name that Next.js sets. It is not a
    // setting of the app, and the server code loads only after this check.
    files: ["src/instrumentation.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']:not([property.name='NEXT_RUNTIME'])",
          message: "Only src/lib/config reads process.env (FND-03 rule 1, sds-config).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated by `prisma contract emit` and `prisma migration plan` (DEC-005).
    // Nobody edits these files by hand.
    "src/prisma/contract.d.ts",
    "src/prisma/migrations/**",
    // Output of the test runners.
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
