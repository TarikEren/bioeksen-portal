# Review findings

The running record of code reviews for this repository. Each review has a
file of its own, `review_N.md`, with its summary and the findings it found.
This file holds what spans reviews: the log, the status of every finding,
coverage, the questions, the test gaps and the strengths.

- A finding keeps its ID (`R-nnn`) for life. IDs are never reused or
  renumbered.
- A finding lives in the file of the review that found it. A later review's
  notes on it are added there, so a finding reads whole in one place.
- A review is closed once every finding it found is `Fixed`: its file is
  renamed `fixed_review_N.md`, and the links to it are updated.
- Status is one of `Open`, `Fixed (<commit>)`, `Tracked (<backlog entry>)` or
  `Won't fix (<reason>)`.
- Severity: *Critical* (wrong record, security, data loss), *Major*,
  *Minor*, and *Note* (no defect today; a record or a guard for later).
- Line numbers are as of the review that last touched the finding; the
  symbol is the stable anchor.

## Review log

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| [1](review_1.md) | 2026-10-22 | Stage B0 build: backend `20e604b`..`bfe8170`, frontend `19b9f54`. Two `code-reviewer` agents; the main session checked each claim before it recorded it | `19b9f54` | Request changes: R-001 and R-002 (Major) |
| [2](review_2.md) | 2026-10-22 | The fixes of review 1 (`41b3b1f..8a561f9`), every file under `tests/`, and an anti-overfitting pass over `src/`. Two `code-reviewer` agents; the main session checked the claims before it recorded them | `8a561f9` | Request changes: R-025 and R-026 (Major) |

## Status at a glance

| ID | Title | Severity | Status |
|---|---|---|---|
| [R-001](review_1.md#r-001--answers-that-nextjs-makes-by-itself-under-api-have-no-request-id-no-no-store-header-and-no-envelope) | Answers that Next.js makes by itself under /api have no request id, no no-store header and no envelope | Major | **Fixed (2dcd2cf)** — found in review 1, checked in review 2 |
| [R-002](review_1.md#r-002--a-rejected-call-of-setlanguage-replaces-the-page-with-the-built-in-error-screen-of-nextjs) | A rejected call of setLanguage replaces the page with the built-in error screen of Next.js | Major | **Fixed (284b461)** — found in review 1, checked in review 2 |
| [R-003](review_1.md#r-003--the-choice-between-auth-4101-and-auth-5500-does-not-follow-steps-5-and-6-of-the-selection-procedure) | The choice between AUTH-4101 and AUTH-5500 does not follow steps 5 and 6 of the selection procedure | Minor | **Fixed (b6a4ea4)** — found in review 1, checked in review 2 |
| [R-004](review_1.md#r-004--the-configuration-check-accepts-values-that-the-app-cannot-use) | The configuration check accepts values that the app cannot use | Minor | **Fixed (fc10df1)** — found in review 1, checked in review 2 |
| [R-005](review_1.md#r-005--entra_jwks_max_age_seconds-has-no-upper-limit) | ENTRA_JWKS_MAX_AGE_SECONDS has no upper limit | Minor | **Fixed (fc10df1)** — found in review 1, checked in review 2 |
| [R-006](review_1.md#r-006--the-csp-adds-unsafe-eval-when-app_env-is-development-also-in-a-production-build) | The CSP adds 'unsafe-eval' when APP_ENV is development, also in a production build | Minor | **Fixed (ac5f0f9)** — found in review 1, checked in review 2 |
| [R-007](review_1.md#r-007--a-granted-operator-request-writes-no-security-record) | A granted operator request writes no SECURITY record | Minor | **Fixed (7b7457e)** — found in review 1, checked in review 2 |
| [R-008](review_1.md#r-008--the-operator-services-do-not-check-the-caller) | The operator services do not check the caller | Minor | **Fixed (103a92d)** — found in review 1, checked in review 2 |
| [R-009](review_1.md#r-009--a-streamed-body-over-the-limit-with-a-wrong-media-type-gets-415-not-413) | A streamed body over the limit with a wrong media type gets 415, not 413 | Minor | **Fixed (7b7457e)** — found in review 1, checked in review 2 |
| [R-010](review_1.md#r-010--todatabaseerror-maps-some-driver-failures-to-codes-that-the-database-failures-table-does-not-give) | toDatabaseError maps some driver failures to codes that the Database failures table does not give | Minor | **Fixed (34a051e)** — found in review 1, checked in review 2 |
| [R-011](review_1.md#r-011--dbcheck-falls-back-to-database_url-so-it-can-drop-the-database-of-the-apps-own-configuration) | db:check falls back to DATABASE_URL, so it can drop the database of the app's own configuration | Minor | **Fixed (24bf691)** — found in review 1, checked in review 2 |
| [R-012](review_1.md#r-012--dbcheck-leaves-the-files-it-generated-in-the-working-tree-so-a-second-local-run-passes) | db:check leaves the files it generated in the working tree, so a second local run passes | Minor | **Fixed (56478eb)** — found in review 1, checked in review 2 |
| [R-013](review_1.md#r-013--the-app-does-not-check-the-software-id-at-start-without-it-every-log-record-is-lost) | The app does not check the software id at start; without it, every log record is lost | Minor | **Fixed (18d87e4)** — found in review 1, checked in review 2 |
| [R-014](review_1.md#r-014--no-integration-test-proves-that-platform_refuse_delete-exists-and-the-migration-comment-says-one-does) | No integration test proves that platform_refuse_delete() exists, and the migration comment says one does | Minor | **Fixed (8b9226a)** — found in review 1, checked in review 2 |
| [R-015](review_1.md#r-015--the-jwks-fetch-timeout-does-not-follow-service-callsmd-and-nothing-records-the-difference) | The JWKS fetch timeout does not follow service-calls.md, and nothing records the difference | Minor | **Open** — found in review 1; partly fixed in `4fa4a85` (review 2); the rest is R-030 |
| [R-016](review_1.md#r-016--aria-busy-never-reaches-the-dom-and-the-header-comment-says-that-it-does) | aria-busy never reaches the DOM, and the header comment says that it does | Minor | **Fixed (256317d)** — found in review 1, checked in review 2 |
| [R-017](review_1.md#r-017--the-failure-text-is-the-same-for-every-code-and-the-component-joins-the-strings) | The failure text is the same for every code, and the component joins the strings | Minor | **Fixed (1267122)** — found in review 1, checked in review 2 |
| [R-018](review_1.md#r-018--the-language-names-have-no-lang-attribute) | The language names have no lang attribute | Minor | **Fixed (256317d)** — found in review 1, checked in review 2 |
| [R-019](review_1.md#r-019--at-its-own-tree-the-commit-renders-the-page-text-in-arial-and-its-font-claim-is-false) | At its own tree, the commit renders the page text in Arial, and its font claim is false | Minor | **Fixed (23ac1ee)** — found in review 1, checked in review 2 |
| [R-020](review_1.md#r-020--the-fake-of-setlanguage-in-the-component-test-is-not-typed-to-the-action) | The fake of setLanguage in the component test is not typed to the action | Minor | **Fixed (3a77919)** — found in review 1, checked in review 2 |
| [R-021](review_1.md#r-021--the-read-query-of-the-log-store-is-in-srclib-not-in-a-repository-of-the-platform-module) | The read query of the log store is in src/lib, not in a repository of the platform module | Note | **Fixed (41b3b1f)** — found in review 1, checked in review 2 |
| [R-022](review_1.md#r-022--the-proxy-matcher-leaves-out-every-path-that-starts-with-api) | The proxy matcher leaves out every path that starts with api | Note | **Fixed (8b4cc73)** — found in review 1, checked in review 2 |
| [R-023](review_1.md#r-023--the-root-layout-has-no-locale-provider-for-heroui) | The root layout has no locale provider for HeroUI | Note | **Fixed (8a561f9)** — found in review 1, checked in review 2 |
| [R-024](review_1.md#r-024--the-failure-sentence-uses-the-muted-token) | The failure sentence uses the muted token | Note | **Fixed (1267122)** — found in review 1, checked in review 2 |
| [R-025](review_2.md#r-025--the-smoke-test-of-fnd-02ac4-is-in-the-e2e-tier-which-every-pull-request-runs) | The smoke test of FND-02.AC4 is in the e2e tier, which every pull request runs | Major | **Open** — found in review 2 |
| [R-026](review_2.md#r-026--no-test-covers-the-contract-cases-of-the-b0-endpoints-and-the-logger) | No test covers the contract cases of the B0 endpoints and the logger | Major | **Open** — found in review 2 |
| [R-027](review_2.md#r-027--get-api-is-answered-by-nextjs-with-an-html-404-with-no-envelope-and-no-request-id) | GET /api is answered by Next.js with an HTML 404, with no envelope and no request id | Minor | **Open** — found in review 2 |
| [R-028](review_2.md#r-028--the-csp-still-adds-unsafe-eval-to-a-production-build-that-starts-with-node_envdevelopment) | The CSP still adds 'unsafe-eval' to a production build that starts with NODE_ENV=development | Minor | **Open** — found in review 2 |
| [R-029](review_2.md#r-029--an-html-answer-to-a-prefetch-of-the-browser-has-no-content-security-policy) | An HTML answer to a prefetch of the browser has no Content Security Policy | Minor | **Open** — found in review 2 |
| [R-030](review_2.md#r-030--the-retry-of-the-key-set-fetch-waits-a-fixed-200-ms-with-no-jitter-and-has-no-retry-budget-or-breaker) | The retry of the key-set fetch waits a fixed 200 ms with no jitter, and has no retry budget or breaker | Minor | **Open** — found in review 2 |
| [R-031](review_2.md#r-031--the-check-of-eifu_identity_keys-accepts-a-key-of-any-length-and-duplicate-ids) | The check of EIFU_IDENTITY_KEYS accepts a key of any length and duplicate ids | Minor | **Open** — found in review 2 |
| [R-032](review_2.md#r-032--the-file-size-formatter-does-not-follow-dec-133) | The file-size formatter does not follow DEC-133 | Minor | **Open** — found in review 2 |
| [R-033](review_2.md#r-033--new-unit-tests-wait-on-the-real-clock) | New unit tests wait on the real clock | Minor | **Open** — found in review 2 |
| [R-034](review_2.md#r-034--the-raw-object-test-accepts-any-error-as-the-refusal) | The raw-object test accepts any error as the refusal | Minor | **Open** — found in review 2 |
| [R-035](review_2.md#r-035--a-pipeline-test-cites-fnd-06ac1-for-a-rule-that-ac1-does-not-state) | A pipeline test cites FND-06.AC1 for a rule that AC1 does not state | Minor | **Open** — found in review 2 |
| [R-036](review_2.md#r-036--the-fnd-03-tests-require-status-fail-which-no-criterion-states) | The FND-03 tests require status fail, which no criterion states | Minor | **Open** — found in review 2 |
| [R-037](review_2.md#r-037--the-checkers-b0-result-does-not-depend-on-any-test) | The checker's B0 result does not depend on any test | Minor | **Open** — found in review 2 |
| [R-038](review_2.md#r-038--the-fnd-02ac2-fixture-test-has-no-control-run) | The FND-02.AC2 fixture test has no control run | Minor | **Open** — found in review 2 |
| [R-039](review_2.md#r-039--the-soft-gate-check-does-not-find----echo-or-if-conditions) | The soft-gate check does not find `|| :`, `|| echo` or if conditions | Minor | **Open** — found in review 2 |
| [R-040](review_2.md#r-040--the-fnd-02ac3-test-accepts-any-step-whose-text-holds-bioeksen-sds-and-commit) | The FND-02.AC3 test accepts any step whose text holds bioeksen-sds and commit | Minor | **Open** — found in review 2 |
| [R-041](review_2.md#r-041--the-production-cases-of-fnd-03-have-no-precondition-that-the-production-environment-is-otherwise-valid) | The production cases of FND-03 have no precondition that the production environment is otherwise valid | Minor | **Open** — found in review 2 |
| [R-042](review_2.md#r-042--some-test-titles-carry-the-inputs-and-the-expected-values) | Some test titles carry the inputs and the expected values | Minor | **Open** — found in review 2 |
| [R-043](review_2.md#r-043--the-migration-helper-puts-the-connection-string-in-the-arguments-and-removes-only-the-encoded-password) | The migration helper puts the connection string in the arguments and removes only the encoded password | Minor | **Open** — found in review 2 |
| [R-044](review_2.md#r-044--the-guard-compares-the-host-of-database_url-as-text) | The guard compares the host of DATABASE_URL as text | Minor | **Open** — found in review 2 |
| [R-045](review_2.md#r-045--two-commits-do-not-follow-the-commit-rules) | Two commits do not follow the commit rules | Minor | **Won't fix** (the history of the branch stays) — found in review 2 |
| [R-046](review_2.md#r-046--the-text-reaches-client-components-through-props-not-from-the-locale-provider) | The text reaches client components through props, not from the locale provider | Note | **Open** — found in review 2 |
| [R-047](review_2.md#r-047--an-http-method-that-nextjs-does-not-know-gets-a-bare-400-under-api) | An HTTP method that Next.js does not know gets a bare 400 under /api | Note | **Open** — found in review 2 |
| [R-048](review_2.md#r-048--no-test-uses-the-playwright-web-server-and-it-reads-the-shell-and-env) | No test uses the Playwright web server, and it reads the shell and .env | Note | **Open** — found in review 2 |

## Coverage

| Area | Reviewed in |
|---|---|
| `src/lib/{auth,config,db,errors,http,i18n/server.ts,logging,request-context,security,startup,format}`, `src/modules/platform/**`, `src/app/api/**`, `src/app/_actions/**`, `src/proxy.ts`, `src/instrumentation.ts`, `src/scripts/**`, `eslint.config.mjs`, `next.config.ts` | 1 (read in full; callers and callees one layer each way; the Next.js and jose sources read where cited) |
| `src/prisma/**` (the B0 migrations) | 1 (read; a database pass of `sds-reviewing` is still to do) |
| The fix commits `41b3b1f..8a561f9` | 2 (read in full, one layer each way; each finding of review 1 checked) |
| `src/app/layout.tsx`, `src/app/fonts.css`, `src/app/(public)/**`, `src/lib/i18n/dictionaries/**` | 1 (read in full; HeroUI and React Aria sources read where cited) |
| `tests/**`, `vitest.config.ts`, `playwright.config.ts` | 2 (read in full; the checker run; the unit and component tiers run; the integration, pipeline and e2e tiers not run) |
| `src/**`, anti-overfitting pass | 2 (searched for fixture values, test-only names and seam paths) |
| `src/app/globals.css` | Not reviewed: the owner's change is not committed |

## Questions for the author

| # | Question | Status |
|---|---|---|
| Q-1 | DEC-038: when a trusted proxy added every `X-Forwarded-For` entry, which entry is the source address? | Answered (review 1): the leftmost entry. DEC-038 now says so |
| Q-2 | Which code does a delete that `platform_refuse_delete()` refuses (`23001`) get? | Answered (review 1): `RES-4302`. See R-010 |
| Q-3 | DEC-122: one sentence for each action, or one for each code? | Answered (review 1): one for each code, as DEC-122 says. See R-017 |
| Q-4 | What does the interface show when a call gets no envelope? | Answered (review 1): the localized text of a failed call, with no code. DEC-122 now says so. See R-002 |
| Q-5 | Will the owner commit `src/app/globals.css` before the branch is pushed? | Answered (review 2): yes, committed in `23ac1ee`. R-019 is fixed |
| Q-6 | Where does the stage-exit smoke test of FND-02.AC4 run? | Answered (review 2): in the smoke tier `tests/smoke/`, script `test:smoke`, which the pull request pipeline does not run. The plan (task T2) says so. See R-025 |
| Q-7 | DEC-133: exactly one decimal, or at most one? Which symbol for 1000 bytes? | Answered (review 2): at most one decimal; the symbols `B`, `kB`, `MB`, `GB`. DEC-133 says so. See R-032 |
| Q-8 | Does the data contract name the SQLSTATE that `platform_refuse_delete()` raises? | Answered (review 2): yes, `23001`. The plan's Data table says so. See R-034 |
| Q-9 | Is the answer to a prefetch of the browser an HTML answer of FND-07.AC1? | Answered (review 2): yes. FND-07.AC1 says so. See R-029 |
| Q-10 | Is the delivery of the text by props a departure on purpose? | Answered (review 2): no. Follow `sds-nextjs-frontend` §5 and §6. See R-046 |
| Q-11 | IFU-90: is each key of `EIFU_IDENTITY_KEYS` the AES-256 key itself? | Answered (review 2): yes, 32 bytes, each id once. The FND-03 row says so. See R-031 |
| Q-12 | Does the refetch budget replace the retry budget and the breaker of `service-calls.md`? | Answered (review 2): no. They are *Structural* rules; the fetch follows them. See R-030 |

## Test coverage gaps

| Missing test | Finding | Status |
|---|---|---|
| `OPTIONS`, other methods of the echo seam, and an unknown API path carry `X-Request-Id`, `no-store` and the envelope | R-001 | **Covered in `2dcd2cf` (unit level)** |
| A rejected call of `setLanguage` shows the localized text of a failed call | R-002 | **Covered in `284b461`** |
| `platform_refuse_delete()` exists, and a trigger with it refuses `DELETE` and `TRUNCATE` | R-014 | **Covered in `8b9226a`** |
| `aria-busy` while the action runs | R-016 | **Covered in `256317d`** |
| An empty number setting and a malformed `EIFU_IDENTITY_KEYS` give `CFG-5001` | R-004 | **Covered in `fc10df1`** |
| The contract cases of the B0 endpoints and the logger (list in R-026) | R-026 | **Open** |
| FND-01.AC3 allowed side (a module imports its own repository); a relative import path in AC3 and AC4 | — | **Open** |
| FND-02.AC1 a check made soft by `if:`, `\|\| :` or `\|\| echo` | R-039 | **Open** |
| FND-02.AC3 second sentence (a `Change-Id` without the software id) | R-040 | **Open** |
| FND-04.AC3 the boundary of the clock skew | — | **Open** |
| FND-04.AC4 `no-store` on the 503 of readiness, on a 403 and on a 405 | — | **Open** |
| FND-05.AC1 an id of exactly 128 characters; the id on an HTML answer and on an unknown API path | — | **Open** |
| FND-05.AC2 a request with no `X-Request-Id`: the generated id on the answer and on the log record | — | **Open** |
| FND-07.AC1 the answer to a prefetch; a production build with `NODE_ENV=development` | R-028, R-029 | **Open** |

## Strengths

Recorded so later reviews do not undo them.

- **Review 1:** the algorithm of an operator token comes from the
  configuration, and jose checks `alg` before it resolves a key; `iss`,
  `aud` and `tid` must match exactly; an app token is never an operator.
- **Review 1:** the body limit counts the bytes as they arrive;
  `Content-Length` only gives an early refusal.
- **Review 1:** the test seams stay closed unless `TEST_SEAMS_ENABLED` is
  `true` and `APP_ENV` is `development` or `test`; in production the flag
  fails the start with `CFG-5001`.
- **Review 1:** every code comes from the closed list, and the answer and its
  log record carry the same code; the redaction removes tokens, credentials
  in URLs, secret pairs and email addresses.
- **Review 1:** the language switch gets only the text it shows, imports no
  server-only module, and guards against a second call while one runs.
- **Review 2:** the tests import only the contract's exports, and take their labels from the dictionaries.
- **Review 2:** every suite that creates or resets a database runs the guard first; repository copies and spawned apps never get the shell's `DATABASE_URL` or `.env`.
- **Review 2:** controls sit beside the negative cases (import rules, test, build, drift check, dictionary type check, origin of server actions), and boundaries are tested on both sides (the body limit, the pepper).
