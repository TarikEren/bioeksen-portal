# Tests

The acceptance tests of Bioeksen Portal. The tester (`qa-engineer`) writes
them from the acceptance criteria in `docs/specs/` and the stage plan
(`docs/plans/test_plan.md`), without reading the product code. The
developers do not read them: they run them through `pnpm run test:results`
and read only each test's title, its status and its failure message
(`sds-testing`, **Acceptance tests**).

The developers' own unit and component tests are beside the code in `src/`.

## Tiers and folders

| Tier | Folder | Runner | Script | For |
|---|---|---|---|---|
| unit | `tests/unit/` (and `tests/support/**/*.test.ts`, the helpers' own tests) | Vitest, Node | `pnpm run test` | Pure logic through an export of the contract: the formatter, the contrast of `globals.css` |
| component | `tests/component/` | Vitest, jsdom | `pnpm run test` | A client component through its export (none in B0) |
| integration | `tests/integration/` | Vitest, Node, one file at a time | `pnpm run test:integration` | Route handlers called directly, with a real disposable PostgreSQL 16, a real Redis and the local token issuer |
| pipeline | `tests/pipeline/` | Vitest, Node, 600 s for each test | `pnpm run test:pipeline` | The toolchain on a copy of the repository: install, type check, lint rules, build, drift check, the forge workflow |
| e2e | `tests/e2e/` | Playwright, Chromium | `pnpm run test:e2e` (after `pnpm run build`) | The production build with `next start`: headers, pages, languages, configuration at start |
| smoke | `tests/smoke/` | Playwright, no browser page | `pnpm run test:smoke` | The test environment that IT deployed from a release tag (DEC-128). Its own configuration, `tests/smoke/playwright.config.ts`: no global setup, no web server, base URL from `TEST_ENVIRONMENT_URL`. The pull request pipeline does not run it; the main session runs it at the stage exit (stage plan B0, task T2) |

The runner configuration is `vitest.config.ts`, `playwright.config.ts` and
`tests/smoke/playwright.config.ts`. `pnpm run test:e2e` never runs the smoke
tier.
Each claim is tested at the lowest tier that can prove it.

## How a test cites its criterion

- The title starts with the id of the criterion it proves, then names the
  rule, for example `FND-03.AC4: a missing ENTRA_ISSUER is refused at start`.
  It never holds the inputs, the expected values or the steps: the criterion
  holds the detail. A contract case names its source after the id, for
  example `FND-04.AC3: GET /api/health, sds-auth validation order, step 3: a
  credential that does not parse`.
- A `/** … */` brief above the test states the behaviour of the criterion in
  at most 20 words.
- A contract case of `sds-testing` (`references/contract-tests.md`) cites the
  criterion of the item that adopts the convention, and a `//` comment names
  the source document. For example, the auth cases of the operator
  endpoints cite `FND-04.AC3`, because FND-04 rule 1 adopts the principals of
  `sds-auth`.
- A test never writes the id of a criterion that does not exist: the
  `sds-planning` checker reads every file under `tests/`. A fixture that
  needs such an id builds it at run time.

Check the citations:

```bash
python <sds-planning>/scripts/check_specs.py --specs docs/specs --tests tests --through B0
```

## The results-only interface

```bash
pnpm run test:results                       # every tier
pnpm run test:results unit integration      # some tiers
pnpm run test:results --grep 'FND-04\.AC3'  # one criterion
```

`tests/support/results.ts` runs the tiers with their JSON reporters. For each
test it prints the tier, `PASS`, `FAIL` or `SKIP`, the title, and the failure
message without stack traces, code frames or file paths. It exits 0 when
every test passed, 1 when a test failed or a file did not load, and 2 when a
tier with tests could not run (`NOT RUN`, with the reason).

## Variables of each tier

No tier takes a setting from `.env`. The variables come from the shell. Only
the guard opens the `.env` files, to compare their `DATABASE_URL` with the
target, and it never writes the value. The e2e tier has no
Playwright web server and no base URL: each test file starts the production
build with `support/spawn-app.ts`, on a free port, with exactly the settings
of the test.

| Variable | Tiers | Value |
|---|---|---|
| `TEST_DATABASE_URL` | integration, pipeline (FND-06) | A PostgreSQL 16 database whose name ends in `_integration`, for example `bioeksen_portal_<role>_integration`. The suite drops it, creates it and applies the migrations |
| `TEST_E2E_DATABASE_URL` | e2e | A database whose name ends in `_e2e`, for example `bioeksen_portal_<role>_e2e` |
| `TEST_DATABASE_HOSTS` | integration, e2e, pipeline | The hosts a suite may reset a database on, comma separated. Default: loopback only |
| `TEST_REDIS_URL` | integration, e2e | A Redis 7. Default: `redis://127.0.0.1:6379` |
| `TEST_ENVIRONMENT_URL` | smoke | The base URL of the test environment that IT deployed. Without it, the smoke test fails and says so |
| `SDS_PLANNING_CHECKER` | pipeline (FND-02.AC2) | The path of `check_specs.py`. Default: the newest copy in the Claude plugin cache |
| `PYTHON` | pipeline (FND-02.AC2) | The Python command. Default: `python` on Windows, `python3` elsewhere |

Every setting of the app (FND-03 rule 2) comes from
`tests/support/test-environment.ts`, never from the shell. The local services
are PostgreSQL 16 and Redis 7 on the loopback address, for example from
`docker compose -f compose.dev.yaml up -d postgres redis`.

The guard (`tests/support/db-guard.ts`) refuses a database whose name does
not end in the suffix of the tier, a host that is not allowed, and the
database of `DATABASE_URL`, in the shell or in a `.env` file of the
repository (`.env`, `.env.local`, and the `.env.<mode>` files that Next.js
loads; not `.env.example`). `localhost`, `127.0.0.1` and `::1` are one host
for that comparison. A `DATABASE_URL` that the guard cannot read makes it
refuse. A suite the guard refuses is not run.

## Helpers

| Helper | Does |
|---|---|
| `support/db-guard.ts` | Accepts a disposable database or refuses it (FND-06 rule 4). Never writes a connection string |
| `support/global-setup/database.ts`, `vitest.ts`, `playwright.ts` | Recreate the disposable database of the tier and apply the migrations, after the guard. The Prisma CLI gets the connection string only in `DATABASE_URL`, never as an argument; `redactConnection` removes it and its password, encoded and decoded, from any output |
| `support/global-setup/jwks.ts` | Integration global setup: makes an RS256 key pair and serves its public key at the Entra JWKS path on 127.0.0.1. The workers read it with `inject("testIssuer")` |
| `support/setup/integration-env.ts` | Each integration worker: the guard again, then every app setting with a test value. PostgreSQL and Redis answer; the object store and the mail relay point to closed ports; `ENTRA_JWKS_URI` is the local issuer; the test seams are on |
| `support/test-environment.ts` | The test values of every setting of FND-03 rule 2 (`appEnvironment`, `productionEnvironment`, `without`), and the issuer, audience, tenant and operator scope that tokens carry |
| `support/operator-token.ts` | `mintToken(issuer, kind)`: an operator token, a person without the role, a role without the scope, an app-only token, an expired token, an expired forged token, a wrong signature, a wrong audience, issuer or tenant, an unknown `kid` |
| `support/route.ts` | Calls a route handler with a `NextRequest`; `expectEnvelope` asserts the error envelope of `sds-api-design`; `detailFields` reads the fields of `details` |
| `support/spawn-app.ts` | `spawnApp({ env })`: starts `next start` on a free port with exactly the given settings (no shell variables, no `.env`), gives the base URL, the stdout and stderr lines and the log records, and stops the app. `waitForRecord` waits for a log record |
| `support/log-records.ts` | Reads log records from stdout lines, in the JSON form or the rendered form of `sds-logging` (`log-record.md`) |
| `support/ports.ts` | A free port, a closed port, and a wait for a port without an HTTP request |
| `support/repo-copy.ts` | `copyRepository({ linkNodeModules })`: a copy of the files git would check out, in a temporary directory; runs `pnpm` there; writes fixtures; removes the copy (it unlinks the linked `node_modules` first) |
| `support/workflow.ts` | Reads `.forgejo/workflows/`: the triggers, the jobs, the `run:` commands (with the bodies of the `pnpm run` scripts they call), and the steps whose failure does not fail the pipeline (`isSoftGate`): `continue-on-error`, `set +e`, each `\|\|` that does not exit with a failure, and an `if:` on the job or the step other than `success()`, `always()` or `!cancelled()`. `commitCheckGates` finds the commit check of the kit (`KIT_COMMIT_CHECK`, its path in the CI image) in the commits job, as a gate |
| `support/contrast.ts` | The contrast table of the `sds-nextjs-frontend` reference page, computed in Node.js from HeroUI's default theme and `src/app/globals.css`: the cascade of custom properties, `oklch()` and `color-mix()`, the paint on a canvas, and the WCAG ratio. Checked against the reference page in Chromium on 2026-10-22 |
| `support/language.ts` | Chooses a language with the language switch, by role and accessible name, with the labels of the dictionaries |
| `support/results.ts` | The results-only interface, `pnpm run test:results` |
| `e2e/fixtures.ts` | `configuredApp`: one production app for each Playwright worker, with every setting valid and the e2e database |
| `support/paths.ts` | The root of the repository |

## Coverage of stage B0

| Criterion | Tier | File |
|---|---|---|
| FND-01.AC1 | pipeline | `pipeline/fnd-01-toolchain.test.ts` |
| FND-01.AC2, FND-01.AC3, FND-01.AC4 | pipeline | `pipeline/fnd-01-import-rules.test.ts` |
| FND-02.AC1, FND-02.AC2, FND-02.AC3 | pipeline | `pipeline/fnd-02-pipeline.test.ts` |
| FND-02.AC4 | smoke (stage exit) | `smoke/fnd-02-test-environment.spec.ts` |
| FND-03.AC1, FND-03.AC2, FND-03.AC3, FND-03.AC4 | e2e | `e2e/fnd-03-configuration.spec.ts` |
| FND-04.AC1 | e2e | `e2e/fnd-04-probes.spec.ts` |
| FND-04.AC2, FND-04.AC3, FND-04.AC4 | integration | `integration/fnd-04-standard-endpoints.test.ts`, `integration/fnd-04-identity-provider.test.ts` |
| FND-05.AC1, FND-05.AC2, FND-05.AC3, FND-05.AC5 | integration | `integration/fnd-05-errors-and-correlation.test.ts` |
| FND-06.AC1, FND-06.AC2 | pipeline | `pipeline/fnd-06-data-layer.test.ts` |
| DEC-005 (no criterion: the raw object `platform_refuse_delete()` of FND-06 rule 5; review 1, R-014) | integration | `integration/dec-005-raw-objects.test.ts` |
| FND-07.AC1, FND-07.AC2, FND-07.AC4 | e2e | `e2e/fnd-07-request-security.spec.ts` |
| FND-07.AC5 | pipeline | `pipeline/fnd-07-dependency-check.test.ts` |
| FND-08.AC1 | pipeline | `pipeline/fnd-08-dictionaries.test.ts` |
| FND-08.AC2, FND-08.AC3, FND-08.AC4 | e2e | `e2e/fnd-08-languages.spec.ts` |
| FND-08.AC6 | unit | `unit/fnd-08-date-time.test.ts` |
| FND-09.AC2 | unit | `unit/fnd-09-contrast.test.ts` |

FND-07.AC4 is in the e2e tier, not in the integration tier of the stage
plan: the Next.js origin check of server actions runs in the server before
the action, so only a request to a running app reaches it.

## Cases not run

| Case | Why | What makes it runnable |
|---|---|---|
| FND-02, the second sentence of AC3: the commit check, run on two commit messages that break `sds-commit` (one with a `Change-Id` without the software id), fails | Release 0.9.0 of the `bioeksen-sds` kit has no commit-check script. The CI proposal names `/opt/bioeksen-sds/${SDS_TAG}/skills/sds-commit/scripts/check_commits.py` as a placeholder, and the pipeline test requires that path in the commits job | A release of the kit with `check_commits.py`: then a pipeline test runs it on the two messages, and expects a failure, after a control run on a good message |

## Known defects

A test of behaviour that exists, and is wrong, is marked expected to fail
(`test.fails` in Vitest, `test.fail()` in Playwright), with a precondition
test beside it.

| Test | Defect | Source |
|---|---|---|
| — | — | — |
