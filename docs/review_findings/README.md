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

## Status at a glance

| ID | Title | Severity | Status |
|---|---|---|---|
| [R-001](review_1.md#r-001--answers-that-nextjs-makes-by-itself-under-api-have-no-request-id-no-no-store-header-and-no-envelope) | Answers that Next.js makes by itself under /api have no request id, no no-store header and no envelope | Major | **Open** — found in review 1 |
| [R-002](review_1.md#r-002--a-rejected-call-of-setlanguage-replaces-the-page-with-the-built-in-error-screen-of-nextjs) | A rejected call of setLanguage replaces the page with the built-in error screen of Next.js | Major | **Open** — found in review 1 |
| [R-003](review_1.md#r-003--the-choice-between-auth-4101-and-auth-5500-does-not-follow-steps-5-and-6-of-the-selection-procedure) | The choice between AUTH-4101 and AUTH-5500 does not follow steps 5 and 6 of the selection procedure | Minor | **Open** — found in review 1 |
| [R-004](review_1.md#r-004--the-configuration-check-accepts-values-that-the-app-cannot-use) | The configuration check accepts values that the app cannot use | Minor | **Open** — found in review 1 |
| [R-005](review_1.md#r-005--entra_jwks_max_age_seconds-has-no-upper-limit) | ENTRA_JWKS_MAX_AGE_SECONDS has no upper limit | Minor | **Open** — found in review 1 |
| [R-006](review_1.md#r-006--the-csp-adds-unsafe-eval-when-app_env-is-development-also-in-a-production-build) | The CSP adds 'unsafe-eval' when APP_ENV is development, also in a production build | Minor | **Open** — found in review 1 |
| [R-007](review_1.md#r-007--a-granted-operator-request-writes-no-security-record) | A granted operator request writes no SECURITY record | Minor | **Open** — found in review 1 |
| [R-008](review_1.md#r-008--the-operator-services-do-not-check-the-caller) | The operator services do not check the caller | Minor | **Open** — found in review 1 |
| [R-009](review_1.md#r-009--a-streamed-body-over-the-limit-with-a-wrong-media-type-gets-415-not-413) | A streamed body over the limit with a wrong media type gets 415, not 413 | Minor | **Open** — found in review 1 |
| [R-010](review_1.md#r-010--todatabaseerror-maps-some-driver-failures-to-codes-that-the-database-failures-table-does-not-give) | toDatabaseError maps some driver failures to codes that the Database failures table does not give | Minor | **Open** — found in review 1 |
| [R-011](review_1.md#r-011--dbcheck-falls-back-to-database_url-so-it-can-drop-the-database-of-the-apps-own-configuration) | db:check falls back to DATABASE_URL, so it can drop the database of the app's own configuration | Minor | **Open** — found in review 1 |
| [R-012](review_1.md#r-012--dbcheck-leaves-the-files-it-generated-in-the-working-tree-so-a-second-local-run-passes) | db:check leaves the files it generated in the working tree, so a second local run passes | Minor | **Open** — found in review 1 |
| [R-013](review_1.md#r-013--the-app-does-not-check-the-software-id-at-start-without-it-every-log-record-is-lost) | The app does not check the software id at start; without it, every log record is lost | Minor | **Open** — found in review 1 |
| [R-014](review_1.md#r-014--no-integration-test-proves-that-platform_refuse_delete-exists-and-the-migration-comment-says-one-does) | No integration test proves that platform_refuse_delete() exists, and the migration comment says one does | Minor | **Open** — found in review 1 |
| [R-015](review_1.md#r-015--the-jwks-fetch-timeout-does-not-follow-service-callsmd-and-nothing-records-the-difference) | The JWKS fetch timeout does not follow service-calls.md, and nothing records the difference | Minor | **Open** — found in review 1 |
| [R-016](review_1.md#r-016--aria-busy-never-reaches-the-dom-and-the-header-comment-says-that-it-does) | aria-busy never reaches the DOM, and the header comment says that it does | Minor | **Open** — found in review 1 |
| [R-017](review_1.md#r-017--the-failure-text-is-the-same-for-every-code-and-the-component-joins-the-strings) | The failure text is the same for every code, and the component joins the strings | Minor | **Open** — found in review 1 |
| [R-018](review_1.md#r-018--the-language-names-have-no-lang-attribute) | The language names have no lang attribute | Minor | **Open** — found in review 1 |
| [R-019](review_1.md#r-019--at-its-own-tree-the-commit-renders-the-page-text-in-arial-and-its-font-claim-is-false) | At its own tree, the commit renders the page text in Arial, and its font claim is false | Minor | **Open** — found in review 1 |
| [R-020](review_1.md#r-020--the-fake-of-setlanguage-in-the-component-test-is-not-typed-to-the-action) | The fake of setLanguage in the component test is not typed to the action | Minor | **Open** — found in review 1 |
| [R-021](review_1.md#r-021--the-read-query-of-the-log-store-is-in-srclib-not-in-a-repository-of-the-platform-module) | The read query of the log store is in src/lib, not in a repository of the platform module | Note | **Open** — found in review 1 |
| [R-022](review_1.md#r-022--the-proxy-matcher-leaves-out-every-path-that-starts-with-api) | The proxy matcher leaves out every path that starts with api | Note | **Open** — found in review 1 |
| [R-023](review_1.md#r-023--the-root-layout-has-no-locale-provider-for-heroui) | The root layout has no locale provider for HeroUI | Note | **Open** — found in review 1 |
| [R-024](review_1.md#r-024--the-failure-sentence-uses-the-muted-token) | The failure sentence uses the muted token | Note | **Open** — found in review 1 |

## Coverage

| Area | Reviewed in |
|---|---|
| `src/lib/{auth,config,db,errors,http,i18n/server.ts,logging,request-context,security,startup,format}`, `src/modules/platform/**`, `src/app/api/**`, `src/app/_actions/**`, `src/proxy.ts`, `src/instrumentation.ts`, `src/scripts/**`, `eslint.config.mjs`, `next.config.ts` | 1 (read in full; callers and callees one layer each way; the Next.js and jose sources read where cited) |
| `src/prisma/**` (the B0 migrations) | 1 (read; a database pass of `sds-reviewing` is still to do) |
| `src/app/layout.tsx`, `src/app/fonts.css`, `src/app/(public)/**`, `src/lib/i18n/dictionaries/**` | 1 (read in full; HeroUI and React Aria sources read where cited) |
| `tests/**` | Not reviewed for test quality |
| `src/app/globals.css` | Not reviewed: the owner's change is not committed |

## Questions for the author

| # | Question | Status |
|---|---|---|
| Q-1 | DEC-038: when a trusted proxy added every `X-Forwarded-For` entry, which entry is the source address? | Answered (review 1): the leftmost entry. DEC-038 now says so |
| Q-2 | Which code does a delete that `platform_refuse_delete()` refuses (`23001`) get? | Answered (review 1): `RES-4302`. See R-010 |
| Q-3 | DEC-122: one sentence for each action, or one for each code? | Answered (review 1): one for each code, as DEC-122 says. See R-017 |
| Q-4 | What does the interface show when a call gets no envelope? | Answered (review 1): the localized text of a failed call, with no code. DEC-122 now says so. See R-002 |
| Q-5 | Will the owner commit `src/app/globals.css` before the branch is pushed? | Open (review 1). See R-019 |

## Test coverage gaps

| Missing test | Finding | Status |
|---|---|---|
| `OPTIONS`, other methods of the echo seam, and an unknown API path carry `X-Request-Id`, `no-store` and the envelope | R-001 | **Open** |
| A rejected call of `setLanguage` shows the localized text of a failed call | R-002 | **Open** |
| `platform_refuse_delete()` exists, and a trigger with it refuses `DELETE` and `TRUNCATE` | R-014 | **Open** |
| `aria-busy` while the action runs | R-016 | **Open** |
| An empty number setting and a malformed `EIFU_IDENTITY_KEYS` give `CFG-5001` | R-004 | **Open** |

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
