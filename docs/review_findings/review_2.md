# Review 2 — Stage B0: the fixes of review 1, the acceptance tests, and the anti-overfitting pass

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| 2 | 2026-10-22 | Part A: the commits `41b3b1f..8a561f9` (17 fixes, the audit overrides, the owner's `globals.css`, two test commits), checked against each finding of review 1. Part B: every file under `tests/`, `vitest.config.ts` and `playwright.config.ts`, and an anti-overfitting pass over `src/`. Two `code-reviewer` agents; the main session checked the claims before it recorded them | `8a561f9` | Request changes: R-025 and R-026 (Major) |

The log of every review, and the status of every finding: [README](README.md).

## Summary

**Part A.** 23 findings of review 1 are fixed and checked; R-015 is partly
fixed (the header of `jwks.ts` is still not true). The fixes add no Critical
or Major defect. The new defects of the fix code are R-027, R-028, R-030,
R-031, R-033, R-045, R-046 and R-047.

**Part B.** The tests are black-box, and every suite that resets a database
runs the guard first. The anti-overfitting pass found no fixture constant,
no test-only branch and no production path to a test seam. Two Major gaps:
the FND-02.AC4 smoke test runs on every pull request (R-025), and no test
covers the contract cases of the B0 endpoints and the logger (R-026). The
other test findings are Minor.

**How each claim was checked.** The main session searched `tests/` for the
codes of R-026 (no match), and read `src/proxy.ts:37-48` (R-029),
`src/lib/format/file-size.ts:4-13` (R-032) and `tests/support/workflow.ts`
(R-039). The two reviewers reported N5 and F-16 with the same cause and the
same fix: they are merged as R-034. N6 and F-10 are merged as R-035. No claim
was rejected.

**Answers.** The main session answered the questions of both parts (Q-6 to
Q-12 in the README). The answers changed DEC-133, the `EIFU_IDENTITY_KEYS`
row of FND-03, FND-07.AC1 and the stage plan.

**Verdict: Request changes.** R-025 and R-026 block the stage exit.

## Findings

Line numbers are as of `8a561f9`.

### R-025 — The smoke test of FND-02.AC4 is in the e2e tier, which every pull request runs

- **Status:** **Open** · **Severity:** Major · **Found:** review 2 (tests reviewer; confirmed by the main session)
- **Where:** `tests/e2e/fnd-02-test-environment.spec.ts:12-21`; `playwright.config.ts:17-19`; `tests/README.md:72`.
- **Problem:** without `TEST_ENVIRONMENT_URL` the test fails every pull request; with it, a pull request depends on the deployment of another commit. `main` needs every suite green, and a release tag needs a commit on `main`, so the stage can never merge.
- **Fix:** move the test to `tests/smoke/`, with its own Playwright configuration (no global setup, no web server, base URL from `TEST_ENVIRONMENT_URL`) and the script `test:smoke`. The plan now says so (task T2, Q-6).

### R-026 — No test covers the contract cases of the B0 endpoints and the logger

- **Status:** **Open** · **Severity:** Major · **Found:** review 2 (tests reviewer; confirmed by the main session: no match for `RES-4500`, `VAL-4003`, `VAL-4004`, `VAL-4005`, `SYS-5500` or `LOG_LEVEL` under `tests/`)
- **Where:** `tests/integration/fnd-04-standard-endpoints.test.ts`, `tests/integration/fnd-05-errors-and-correlation.test.ts`; the contract in `docs/plans/test_plan.md`.
- **Problem:** `sds-testing` (**The cases**, `contract-tests.md`) says the contract cases are never dropped. No acceptance test checks: the list defaults and limits of `GET /api/admin/logs` (`VAL-4003`, `VAL-4004`, `VAL-4005`, a page past the last), 405 `RES-4500` with `Allow` after the credential check, 503 `SYS-5500` while the configuration is unusable, no bearer token in a log record, the severity from the code, the fixed prose, `LOG_LEVEL`, and `VAL-4006` on the echo seam.
- **Fix:** add the cases, citing the criterion that adopts the convention (FND-04.AC3 or AC4, FND-05.AC2) or naming the source. Run `check_service.py` of `sds-testing` against the app, or record why not.

### R-027 — GET /api is answered by Next.js with an HTML 404, with no envelope and no request id

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (fixes reviewer; confirmed from the code)
- **Where:** `src/app/api/[...path]/route.ts` (the folder name); `src/proxy.ts:42`.
- **Problem:** a catch-all `[...path]` needs at least one segment, and the proxy leaves `/api` out. `GET /api` gets the not-found page of Next.js. Same class as R-001.
- **Fix:** rename the folder to `[[...path]]`, and add `/api` to the tests.

### R-028 — The CSP still adds 'unsafe-eval' to a production build that starts with NODE_ENV=development

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (fixes reviewer; confirmed from the code)
- **Where:** `src/lib/config/index.ts:159-161`, `isDevelopmentServer`; `src/proxy.ts:22`.
- **Problem:** `next start` keeps an explicit `NODE_ENV`, and the proxy reads the run-time value. FND-07 rule 1 says a production build never adds it.
- **Fix:** tie the exception to the build (the literal `process.env.NODE_ENV` that `next build` replaces), and add a test.

### R-029 — An HTML answer to a prefetch of the browser has no Content Security Policy

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed by the main session from the code)
- **Where:** `src/proxy.ts:37-48`, the `missing` clause.
- **Problem:** `GET /` with `Purpose: prefetch` does not go through the proxy, so the HTML answer has no CSP and no `frame-ancestors 'none'`. FND-07.AC1 now says the prefetch answer is included (Q-9).
- **Fix:** run the proxy for every request that can get HTML; keep an exclusion only for answers that are not HTML (the RSC payload). The tester adds a case with `Purpose: prefetch`.

### R-030 — The retry of the key-set fetch waits a fixed 200 ms with no jitter, and has no retry budget or breaker

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (fixes reviewer; confirmed)
- **Where:** `src/lib/auth/jwks.ts:129`, `fetchWithRetry`; `src/lib/config/empirical.ts:13-14`.
- **Problem:** `service-calls.md` puts full jitter, the ratio budget and the breaker in the *Structural* rules, which an app cannot override. Every instance that fails at the same time retries at the same instant.
- **Fix:** full jitter from 0 to 200 ms, and the retry budget and the breaker of `service-calls.md` (Q-12). Then correct the header of `jwks.ts` (the rest of R-015).

### R-031 — The check of EIFU_IDENTITY_KEYS accepts a key of any length and duplicate ids

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (fixes reviewer; Plausible, made real by Q-11)
- **Where:** `src/lib/config/schema.ts:52-64`; `src/lib/config/config.test.ts:102`.
- **Problem:** `k1:c2VjcmV0` (6 bytes) passes in production, and `k1:…,k1:…` passes. DEC-081 uses AES-256-GCM, and the FND-03 row now says each key decodes to 32 bytes and each id is there once.
- **Fix:** require 32 bytes and unique ids; correct the test.

### R-032 — The file-size formatter does not follow DEC-133

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed by the main session)
- **Where:** `src/lib/format/file-size.ts:4`, `:9`, `:12-13`.
- **Problem:** the symbol is `KB`; DEC-133 says `kB`. DEC-133 now also says "at most one decimal" (Q-7).
- **Fix:** use `B`, `kB`, `MB`, `GB`; keep at most one decimal; correct the header and the developer's tests.

### R-033 — New unit tests wait on the real clock

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (fixes reviewer; confirmed)
- **Where:** `src/lib/auth/jwks.test.ts:118` (a 1.1 s sleep), `:52`, `:78`, `:90`, `:103`; `src/lib/auth/auth.test.ts:103`.
- **Problem:** `sds-testing` (**Determinism**) forbids sleeps. A 1 s maximum age against a 1.1 s sleep can go either way on a slow runner.
- **Fix:** fake timers or an injected clock and wait.

### R-034 — The raw-object test accepts any error as the refusal

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (both reviewers, merged; confirmed)
- **Where:** `tests/integration/dec-005-raw-objects.test.ts:66`, `:69`.
- **Problem:** a syntax or permission error also passes. R-010 maps `23001` to `RES-4302`, and depends on that exact SQLSTATE. The plan's data contract now names `23001` (Q-8).
- **Fix:** assert SQLSTATE `23001`.

### R-035 — A pipeline test cites FND-06.AC1 for a rule that AC1 does not state

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (both reviewers, merged; confirmed)
- **Where:** `tests/pipeline/fnd-06-data-layer.test.ts:97-118`.
- **Problem:** AC1 says only that drift fails the check. The exit code 2 and "never `DATABASE_URL`" come from `sds-testing` (**Test databases**).
- **Fix:** keep the test; title it with its source.

### R-036 — The FND-03 tests require status fail, which no criterion states

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed)
- **Where:** `tests/e2e/fnd-03-configuration.spec.ts:33-38`, `expectNotReady`.
- **Problem:** 503 with `not-ready` meets the criteria and the contract, but fails the tests.
- **Fix:** assert 503 and a `status` of `fail` or `not-ready`.

### R-037 — The checker's B0 result does not depend on any test

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed by its run with `--tests tests/README.md`)
- **Where:** `tests/README.md:107-126`; `tests/support/contrast.ts:3`, `tests/support/workflow.ts:2`; `tests/pipeline/fnd-02-pipeline.test.ts:79-81`.
- **Problem:** the checker counts every id under the given paths, so the README alone gives "12 of 12". A deleted test file still passes.
- **Fix:** run the checker over the test folders only (the plan now names them); keep ids out of the helpers' comments; make the FND-02.AC2 test require the folders. The CI proposal changes to match.

### R-038 — The FND-02.AC2 fixture test has no control run

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed)
- **Where:** `tests/pipeline/fnd-02-pipeline.test.ts:177-196`.
- **Problem:** the test expects exit 1. A command that always fails also gives exit 1.
- **Fix:** run the same command on the unchanged copy first, and expect exit 0.

### R-039 — The soft-gate check does not find `|| :`, `|| echo` or if conditions

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed by the main session)
- **Where:** `tests/support/workflow.ts:327-335`, `isSoftGate`; `:243-259`.
- **Problem:** `pnpm test || echo failed` and a step with `if: github.event_name == 'push'` pass the FND-02.AC1 and FND-07.AC5 tests, but cannot fail a pull request.
- **Fix:** treat each `||` that does not exit with a failure as soft; read `if:` and treat any condition other than the default as soft; add the cases to `workflow.test.ts`.

### R-040 — The FND-02.AC3 test accepts any step whose text holds bioeksen-sds and commit

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed)
- **Where:** `tests/pipeline/fnd-02-pipeline.test.ts:86-94`.
- **Problem:** `mint_change_id.py` or an `echo` matches. The second sentence of AC3 has no assertion.
- **Fix:** match the kit's commit check by its path and name, in the commits job, with no soft gate. When the kit has the script, add a fixture run on two bad messages; until then, report that case as not run.

### R-041 — The production cases of FND-03 have no precondition that the production environment is otherwise valid

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed)
- **Where:** `tests/e2e/fnd-03-configuration.spec.ts:81-95`, `:98-112`.
- **Problem:** AC3 accepts any `FATAL CFG-5001`; the 32-character case waits 5 s and asserts an absence.
- **Fix:** a precondition test (the production fixture reports ready); AC3 requires the record to name `TEST_SEAMS_ENABLED`; the 32-character case waits for ready first.

### R-042 — Some test titles carry the inputs and the expected values

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; confirmed)
- **Where:** `tests/unit/fnd-08-date-time.test.ts:13`, `:18`; `tests/e2e/fnd-03-configuration.spec.ts:60`, `:81`; `tests/README.md:27-29`; the FND-04.AC3 titles.
- **Problem:** `sds-testing` (**What the developers see**): a title never carries inputs, expected values or steps.
- **Fix:** name the rule, or the source of a contract case; change the README example.

### R-043 — The migration helper puts the connection string in the arguments and removes only the encoded password

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; Plausible: real if the Prisma CLI prints the decoded password)
- **Where:** `tests/support/global-setup/database.ts:58`, `:65-66`.
- **Problem:** a password with a `%` code is printed decoded; the URL is visible in the process list. `sds-testing` forbids printing a connection string.
- **Fix:** give the URL only through `DATABASE_URL`, and remove both the decoded and the encoded password from the output.

### R-044 — The guard compares the host of DATABASE_URL as text

- **Status:** **Open** · **Severity:** Minor · **Found:** review 2 (tests reviewer; Plausible)
- **Where:** `tests/support/db-guard.ts:141-144`.
- **Problem:** `localhost` and `127.0.0.1` with the same name pass as two databases, and the setup drops the database `WITH (FORCE)`. The guard does not read `.env`.
- **Fix:** treat the loopback names as one host; compare the `DATABASE_URL` of `.env` too, without printing it; add the cases to `db-guard.test.ts`.

### R-045 — Two commits do not follow the commit rules

- **Status:** **Won't fix** (the history of the branch stays as it is; the release note of B0 lists R-007 and R-009 in one entry, and `3a77919` as a test change) · **Severity:** Minor · **Found:** review 2 (fixes reviewer; confirmed)
- **Where:** `3a77919` (`fix(ui)` that changes only a test), `7b7457e` (R-007 and R-009 in one commit).
- **Problem:** `sds-commit`: `test` is the type for a correction of a test, and one commit holds one change.
- **Fix:** none. Later fix commits follow the rule.

### R-046 — The text reaches client components through props, not from the locale provider

- **Status:** **Open** · **Severity:** Note · **Found:** review 2 (fixes reviewer; confirmed)
- **Where:** `src/lib/i18n/locale-provider.tsx:13-15`, `:44-50`.
- **Problem:** `sds-nextjs-frontend` §5 and §6: the provider gives client components their dictionary, and a client component reads it from context. `useLanguage` has no caller.
- **Fix:** follow §5 and §6 (Q-10): the provider carries the dictionary of the active language, and the switch reads its text from it.

### R-047 — An HTTP method that Next.js does not know gets a bare 400 under /api

- **Status:** **Open** · **Severity:** Note · **Found:** review 2 (fixes reviewer; Plausible: real if the reverse proxy of IT forwards such methods)
- **Where:** `node_modules/next/dist/server/route-modules/app-route/module.js:210-212`; `src/proxy.ts:42`.
- **Problem:** `TRACE /api/health` gets 400 with no body, no `X-Request-Id` and no `no-store`.
- **Fix:** the reverse proxy refuses the methods outside RFC 9110; record it in the notes for IT, or let the proxy handle them on `/api`.

### R-048 — No test uses the Playwright web server, and it reads the shell and .env

- **Status:** **Open** · **Severity:** Note · **Found:** review 2 (tests reviewer; confirmed)
- **Where:** `playwright.config.ts:29-45`; `tests/README.md:63`.
- **Problem:** the web server starts `next start` with the whole shell and `.env`, before the global setup, and no test uses it. The README says no tier reads `.env`.
- **Fix:** remove `webServer` and `use.baseURL`, or give the web server the test environment; correct the README.

## Earlier findings

- **R-001 to R-014, R-016 to R-020, R-022 to R-024:** fixed; checked in this review. See the notes in [review 1](review_1.md).
- **R-015:** partly fixed in `4fa4a85`. The header of `jwks.ts` is still not true. R-030 holds the rest.
- **R-021:** fixed by the spec text of `41b3b1f`.
