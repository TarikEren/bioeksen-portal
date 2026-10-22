/**
 * Builds the common-password list of DEC-028 and DEC-137:
 * `src/modules/identity/domain/common-passwords-list.ts`.
 *
 * The source is the password list of the published npm package
 * `@zxcvbn-ts/language-common` (`src/passwords.json`, MIT license). The script
 * keeps each entry of 15 characters or more, because DEC-028 refuses each
 * shorter password with its length rule (DEC-137). It lowers the case, removes
 * the duplicates and sorts the entries, so a second run gives the same file.
 *
 * The package is not a dependency of the app. A person fetches it once, from
 * the npm registry only, and gives the script the folder that holds it:
 *
 *   npm pack @zxcvbn-ts/language-common
 *   tar xzf zxcvbn-ts-language-common-<version>.tgz -C <empty folder>
 *   node --no-warnings src/scripts/build-common-passwords.ts <empty folder>/package
 *
 * The script reads two files of the folder as data (`package.json` and
 * `src/passwords.json`). It never runs code of the package.
 *
 * This file is a script of the repository, not part of the app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const MIN_ENTRY_LENGTH = 15;

const root = path.resolve(import.meta.dirname, "..", "..");
const outputPath = path.join(root, "src", "modules", "identity", "domain", "common-passwords-list.ts");

const PackageInfo = z.object({
  name: z.literal("@zxcvbn-ts/language-common"),
  version: z.string().regex(/^[0-9A-Za-z.+-]+$/),
  license: z.literal("MIT"),
});
const PasswordList = z.array(z.string());

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function main(): void {
  const folder = process.argv[2];
  if (folder === undefined) {
    process.stderr.write("usage: build-common-passwords.ts <folder of @zxcvbn-ts/language-common>\n");
    process.exit(2);
  }
  const info = PackageInfo.parse(readJson(path.join(folder, "package.json")));
  const entries = PasswordList.parse(readJson(path.join(folder, "src", "passwords.json")));

  const kept = [
    ...new Set(
      entries.map((entry) => entry.toLowerCase()).filter((entry) => [...entry].length >= MIN_ENTRY_LENGTH),
    ),
  ].sort();

  const lines = kept.map((entry) => `  ${JSON.stringify(entry)},`);
  const text = `/**
 * The common-password list of DEC-028 and DEC-137. Do not edit: the script
 * \`src/scripts/build-common-passwords.ts\` makes this file.
 *
 * Source: the password list of the npm package \`${info.name}\` ${info.version}
 * (\`src/passwords.json\`), license ${info.license}.
 *
 * The license of the package (LICENSE.txt, MIT), in full:
 *
 * Copyright (c) 2012-2016 Dan Wheeler and Dropbox, Inc.
 * Copyright (c) 2021 @zxcvbn-ts
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Rule of the file (DEC-137): it holds each entry of ${MIN_ENTRY_LENGTH} characters or more
 * of the source. DEC-028 refuses each shorter password, so a shorter entry has
 * no use. The entries are lower case, without duplicates, in sorted order.
 * Entries: ${kept.length}.
 */
export const COMMON_PASSWORD_ENTRIES: readonly string[] = [
${lines.join("\n")}
];
`;
  writeFileSync(outputPath, text, "utf8");
  process.stdout.write(`${kept.length} entries written to ${path.relative(root, outputPath)}\n`);
}

main();
