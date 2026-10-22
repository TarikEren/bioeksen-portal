/**
 * The check of the specifications and of the citations of the tests
 * (FND-02 rule 2): `pnpm run specs:check`.
 *
 * It runs the checker of `sds-planning` over `docs/specs` and over the
 * acceptance tests in `tests`:
 *
 *     python <SDS_PLANNING_CHECKER> --specs docs/specs --tests tests
 *
 * `SDS_PLANNING_CHECKER` is the path of `check_specs.py`. Without it the script
 * stops and says so. `PYTHON` names the Python command. Default: `python` on
 * Windows and `python3` elsewhere. Extra arguments, such as `--through B0`, go
 * to the checker.
 *
 * Exit codes: the exit code of the checker, or 2 when the checker could not run.
 *
 * This file is a script of the repository, not part of the app, so it reads
 * `process.env` itself.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");

function fail(message: string): never {
  console.error(`specs:check could not run: ${message}`);
  process.exit(2);
}

const checker = process.env["SDS_PLANNING_CHECKER"];
if (checker === undefined || checker === "") {
  fail(
    "SDS_PLANNING_CHECKER is not set. Set it to the path of check_specs.py of the sds-planning skill, for example SDS_PLANNING_CHECKER=<sds-planning>/scripts/check_specs.py.",
  );
}
if (!existsSync(checker)) {
  fail(`SDS_PLANNING_CHECKER does not name a file: ${checker}`);
}

const configuredPython = process.env["PYTHON"];
const python = configuredPython !== undefined && configuredPython !== "" ? configuredPython : process.platform === "win32" ? "python" : "python3";

const result = spawnSync(python, [checker, "--specs", "docs/specs", "--tests", "tests", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

if (result.error !== undefined) {
  fail(`the command "${python}" did not start (${result.error.message}). Set PYTHON to a Python 3 command.`);
}
process.exit(result.status ?? 2);
