# Review 1 — Stage B0: the build of the foundation

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| 1 | 2026-10-22 | The B0 build: the backend commits `20e604b`..`bfe8170` and the frontend commit `19b9f54`, with the parts of the skeleton `a5a5043` that they use. Two `code-reviewer` agents, one for the backend and one for the frontend. The main session checked each claim before it recorded it | `19b9f54` | Request changes: R-001 and R-002 block the stage exit |

The log of every review, and the status of every finding: [README](README.md).

## Summary

The core of the security work holds: the operator-token check, the body
limit, the test-seam gate, the redaction of log records, the closed list of
codes and the forward-only migration. The reviewers found 24 defects: 2 Major,
18 Minor and 4 Notes.

- **R-001** (Major): Next.js answers `OPTIONS` on the API paths, the other
  methods of the echo seam, and unknown API paths by itself. These answers
  have no `X-Request-Id`, no `Cache-Control: no-store` and no envelope.
- **R-002** (Major): a call of `setLanguage` that rejects replaces the page
  with the built-in error screen of Next.js.
- **R-019**: the committed `src/app/globals.css` is the scaffold file. At the
  commit, the page text is in Arial and HeroUI has no CSS. The owner's change
  is still not committed.

**How each claim was checked.** The main session read the cited lines at
`19b9f54` for R-001, R-002, R-004, R-005, R-006, R-009, R-010, R-011, R-013,
R-014, R-016 and R-022. It read `auto-implement-methods.js` of Next.js for
R-001. The other findings are recorded as the reviewers confirmed them, with
the evidence they cite. No claim was rejected. Each reviewer verdict on a
decision of the developer is in **Decisions** below.

**Verdict: Request changes.** Fix R-001 and R-002 first. The Minor findings
are follow-ups of this stage: fix them before the stage exit, except where a
finding says otherwise.

## Findings

Line numbers are as of `19b9f54`.

### R-001 — Answers that Next.js makes by itself under /api have no request id, no no-store header and no envelope

- **Status:** **Fixed (2dcd2cf)** · **Severity:** Major · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/app/api/health/route.ts:13-21`, `src/app/api/health/ready/route.ts`, `src/app/api/health/live/route.ts`, `src/app/api/admin/logs/route.ts` (no `OPTIONS` export); `src/app/api/test/echo/route.ts:16` (only `POST`); no catch-all under `src/app/api/`; `src/proxy.ts:41` leaves out `/api`.
- **Problem:**
  - `OPTIONS /api/health` answers 204 with `Allow: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT`. It has no `Cache-Control` and no `X-Request-Id`, and `Allow` names four methods that answer 405. This breaks FND-04.AC4 and the contract (every answer carries `X-Request-Id`).
  - `GET /api/test/echo` answers 405 with no body. With the seams off, `POST` answers 404 and `GET` answers 405, so a caller can see that the seam route exists.
  - `GET /api/unknown` answers with the 404 HTML page of Next.js, not `RES-4200`.
  - Evidence: `node_modules/next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js:16-20` and `:48-72`.
- **Fix:** export `OPTIONS` on the four paths through the route wrapper; export the other methods of the echo route through the wrapper with the seam gate (404 when off); add `src/app/api/[...path]/route.ts` that answers 404 `RES-4200` through the wrapper for every method.
- **Review 2:** fixed in `2dcd2cf`, checked by review 2. The bare path `/api` is still open: R-027.

### R-002 — A rejected call of setLanguage replaces the page with the built-in error screen of Next.js

- **Status:** **Fixed (284b461)** · **Severity:** Major · **Found:** review 1 (frontend reviewer; confirmed by the main session from the code)
- **Where:** `src/app/(public)/_components/language-switch.tsx:43-57`, `choose`.
- **Problem:**
  - The action promise rejects when no envelope comes back: the network fails, the tab is from an earlier build (unknown action id), or the server answers with something that is not an action result.
  - `choose` has no `try`/`catch` inside `startTransition`, and the app has no `error.tsx` or `global-error.tsx`. Next.js sends the error to the nearest boundary, so the page shows the built-in English error text (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md:376`).
- **Fix:** catch the rejection in `choose`, and show the localized text of a failed call with no code (DEC-122, as changed by Q-4). Never show `error.message`. Add a component test whose fake rejects.
- **Review 2:** fixed in `284b461`, checked by review 2.

### R-003 — The choice between AUTH-4101 and AUTH-5500 does not follow steps 5 and 6 of the selection procedure

- **Status:** **Fixed (b6a4ea4)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed)
- **Where:** `src/lib/auth/index.ts:115-138`, `authenticateOperator`; `src/lib/auth/jwks.ts:75-80`, `JwksCache.resolve`.
- **Problem:**
  - The identity provider is down, and a token comes with the `aud` of another app and an unknown `kid`. jose resolves the key before it checks the claims, so the answer is 503 `AUTH-5500`. Step 5 holds first: the answer must be 401 `AUTH-4101`.
  - The provider is down and the refetch budget is spent. A valid token with a new `kid` gets 401 `AUTH-4101`, while the first 6 such requests got 503 `AUTH-5500`.
- **Fix:** check `iss`, `aud` and `tid` on the payload before `jwtVerify`. Keep the result of the last fetch; when the budget is spent and the last fetch failed, answer `AUTH-5500`.
- **Review 2:** fixed in `b6a4ea4`, checked by review 2.

### R-004 — The configuration check accepts values that the app cannot use

- **Status:** **Fixed (fc10df1)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/lib/config/schema.ts:73` (`EIFU_IDENTITY_KEYS`), `:75` (`EIFU_ACCESS_RECORD_RETENTION_DAYS`), `:86` (`AUTH_CLOCK_SKEW_SECONDS`).
- **Problem:**
  - `z.coerce.number()` turns `""` into `0`. `AUTH_CLOCK_SKEW_SECONDS=` passes as 0 s. `EIFU_ACCESS_RECORD_RETENTION_DAYS=` passes as 0 days; the retention pass of B5 would then anonymize every access record at once. FND-03 rule 3 now says that an empty value is `CFG-5001`.
  - `EIFU_IDENTITY_KEYS=abc` passes in production. The failure comes at the first use in B4.
- **Fix:** refuse an empty or blank text before the conversion to a number. Check the form of `EIFU_IDENTITY_KEYS` (a comma list of `id:base64key`, each key decodes).
- **Review 2:** fixed in `fc10df1`, checked by review 2.

### R-005 — ENTRA_JWKS_MAX_AGE_SECONDS has no upper limit

- **Status:** **Fixed (fc10df1)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/lib/config/schema.ts:80`; used at `src/lib/auth/jwks.ts:70`.
- **Problem:** `604800` passes, and the cache keeps keys for 7 days. `sds-auth` (`credentials.md`, **Rotation and revocation**) wants a refresh at least daily, so a removed key can stay accepted for up to 7 days.
- **Fix:** add `.max(86400)`, so a larger value is `CFG-5001`.
- **Review 2:** fixed in `fc10df1`, checked by review 2.

### R-006 — The CSP adds 'unsafe-eval' when APP_ENV is development, also in a production build

- **Status:** **Fixed (ac5f0f9)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/proxy.ts:22`; `src/lib/config/index.ts:135-137`, `isDevelopmentEnvironment`; `src/lib/security/csp.ts:32-34`.
- **Problem:** `next start` with `APP_ENV=development` gives `'unsafe-eval'` in `script-src`. A production build does not need it, and FND-07 rule 1 forbids it.
- **Fix:** base the exception on the development server (`NODE_ENV` `development`, read through the configuration module). FND-07 rule 1 now records this exception.
- **Review 2:** fixed in `ac5f0f9`, checked by review 2. A start with `NODE_ENV=development` is still open: R-028.

### R-007 — A granted operator request writes no SECURITY record

- **Status:** **Fixed (7b7457e)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed)
- **Where:** `src/lib/auth/index.ts:153-155`; `src/lib/http/route.ts:117-119`.
- **Problem:** an operator reads `GET /api/admin/logs`, and no record says so. `sds-logging` (**What to log**) wants each authentication and authorization decision as `SECURITY`.
- **Fix:** write one `SECURITY` `INFO` record with no code for each granted operator request, with `sub` and the path in the tail.
- **Review 2:** fixed in `7b7457e`, checked by review 2.

### R-008 — The operator services do not check the caller

- **Status:** **Fixed (103a92d)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed)
- **Where:** `src/modules/platform/services/log-service.ts:49`, `listLogs`; `src/modules/platform/services/health-service.ts:12`, `:106`, `fullHealth`.
- **Problem:** only the route wrapper checks the caller. A later server component that calls `listLogs()` reads every log record with no check (`sds-nextjs-backend` §1 and §3).
- **Fix:** give `listLogs` and `fullHealth` a parameter of type `OperatorPrincipal` (the access context of B1 later).
- **Review 2:** fixed in `103a92d`, checked by review 2.

### R-009 — A streamed body over the limit with a wrong media type gets 415, not 413

- **Status:** **Fixed (7b7457e)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/lib/http/route.ts:146-149`, `defineJsonRoute`.
- **Problem:** `POST /api/test/echo` with `Transfer-Encoding: chunked`, `Content-Type: text/plain` and 2 MiB of body answers 415 `VAL-4600`. The selection procedure puts step 11 (`VAL-4550`) before step 12: the answer must be 413.
- **Fix:** read the bounded body before the media type check.
- **Review 2:** fixed in `7b7457e`, checked by review 2.

### R-010 — toDatabaseError maps some driver failures to codes that the Database failures table does not give

- **Status:** **Fixed (34a051e)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/lib/db/index.ts:150-160`, `toDatabaseError`.
- **Problem:**
  - `23503` (foreign key) becomes `DB-5001`. The table gives `VAL-4006` for a write that names a missing record, and `RES-4302` for a delete that other rows reference.
  - `40P01` (deadlock) becomes `RES-4301`. The table gives `DB-5002` for a rollback that is not a serialization failure.
  - `23001` (`restrict_violation`, which `platform_refuse_delete()` raises) becomes `DB-5001`.
  - No B0 table has a foreign key or a trigger, so no answer is wrong yet.
- **Fix:** add the operation (write or delete) to the mapping. `23503` gives `VAL-4006` on a write and `RES-4302` on a delete. Class 40 except `40001` gives `DB-5002`. `23001` gives `RES-4302` (Q-2).
- **Review 2:** fixed in `34a051e`, checked by review 2.

### R-011 — db:check falls back to DATABASE_URL, so it can drop the database of the app's own configuration

- **Status:** **Fixed (24bf691)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/scripts/db-check.ts:63-66` (the fallback), `:89-102`, `:153-164` (`DROP DATABASE … WITH (FORCE)`).
- **Problem:** a shell with `DATABASE_URL` naming a local `_integration` database and no `TEST_DATABASE_URL` passes the guard, and the script drops that database with `FORCE`. `sds-testing` (**Test databases**) forbids the database of the app's own configuration.
- **Fix:** require `TEST_DATABASE_URL`, and exit 2 when it is not set.
- **Review 2:** fixed in `24bf691`, checked by review 2. The test harness follows in `b66c7c8`.

### R-012 — db:check leaves the files it generated in the working tree, so a second local run passes

- **Status:** **Fixed (56478eb)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed)
- **Where:** `src/scripts/db-check.ts:171-183`.
- **Problem:** a developer changes `contract.prisma` and does not emit. The first run writes new `contract.json` and `contract.d.ts` and fails; the second run passes, while the commit holds the old files. A check must not change the tree.
- **Fix:** emit to a temporary output and compare, or restore the two files after the comparison.
- **Review 2:** fixed in `56478eb`, checked by review 2.

### R-013 — The app does not check the software id at start; without it, every log record is lost

- **Status:** **Fixed (18d87e4)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; code path confirmed by the main session; trigger Plausible)
- **Where:** `src/lib/logging/index.ts:95-120`, `readSoftwareId`, and `:219`, `:239-242`; `src/lib/startup/index.ts:17-31`.
- **Problem:** if the runtime has no `.bioeksen/software-id` above its working directory, each `write` throws `CFG-5000` in its own `try`. No record reaches stdout or `platform_log_record`, and `/api/health/ready` still answers 200. Plausible until the deployment layout of IT is known.
- **Fix:** read the id at start and treat a failure as a configuration failure, or put the id into the build from the file (`log-record.md`, **Allocating an id**).
- **Review 2:** fixed in `18d87e4`, checked by review 2.

### R-014 — No integration test proves that platform_refuse_delete() exists, and the migration comment says one does

- **Status:** **Fixed (8b9226a)** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/prisma/migrations/app/20261022T0745_platform_log_record_constraints/migration.ts:50-54`; no match for `platform_refuse_delete` under `tests/`.
- **Problem:** DEC-005 says the drift check cannot see the raw objects, so an integration test proves each one. A later migration that drops the function fails no check. The `Test-Exempt: acceptance` trailer of `dd1feca` points to tests that do not cover it.
- **Fix:** the tester adds an integration test: `to_regprocedure('public.platform_refuse_delete()')` is not null, and a trigger on a scratch table refuses `DELETE` and `TRUNCATE`.
- **Review 2:** fixed in `8b9226a`, checked by review 2. The test accepts any error: R-034.

### R-015 — The JWKS fetch timeout does not follow service-calls.md, and nothing records the difference

- **Status:** **Open** · **Severity:** Minor · **Found:** review 1 (backend reviewer; confirmed)
- **Where:** `src/lib/auth/jwks.ts:14-16`, `:25`.
- **Problem:** one attempt of 3 s, with no connect limit and no retry. `service-calls.md` gives connect 500 ms, 1.2 s for each attempt, 2 attempts, 3 s in total, and the deadline header. The comment says the code follows it.
- **Fix:** use the request-path values, or record the override and its reason in `src/lib/config` (`sds-config`, **Overriding an empirical value**). Record the refetch budget (6 in 60 s) there too. Correct the comment.
- **Review 2:** partly fixed in `4fa4a85`, checked by review 2: the values and the departures are in `src/lib/config/empirical.ts`, and the fetch retries. The header of `jwks.ts` is still not true (it names removed constants and one departure of two). The rest is R-030.

### R-016 — aria-busy never reaches the DOM, and the header comment says that it does

- **Status:** **Fixed (256317d)** · **Severity:** Minor · **Found:** review 1 (frontend reviewer; confirmed from the library code)
- **Where:** `src/app/(public)/_components/language-switch.tsx:63`, and the header at lines 13-14.
- **Problem:** React Aria's `ToggleButtonGroup` and `useToolbar` keep only global and label DOM props, so `aria-busy` is dropped. A screen reader is told nothing while the action runs.
- **Fix:** put `aria-busy` on the wrapping `div`, or use a `role="status"` text from the dictionary. Add a test that asserts it while the fake action is pending.
- **Review 2:** fixed in `256317d`, checked by review 2.

### R-017 — The failure text is the same for every code, and the component joins the strings

- **Status:** **Fixed (1267122)** · **Severity:** Minor · **Found:** review 1 (frontend reviewer; confirmed)
- **Where:** `src/app/(public)/_components/language-switch.tsx:80-82`; `src/lib/i18n/dictionaries/tr.ts:17,19`, `en.ts:13,15`.
- **Problem:** `VAL-4001`, `VAL-4002` and `SYS-5000` show the same sentence. The order and `": "` are fixed in JSX. DEC-122 wants the text for the code, and `sds-nextjs-frontend` §6 forbids joined strings.
- **Fix:** a dictionary map keyed by code, with the sentence of the action as the fallback; a template such as `"Hata kodu: {code}"` through a project formatter.
- **Review 2:** fixed in `1267122`, checked by review 2.

### R-018 — The language names have no lang attribute

- **Status:** **Fixed (256317d)** · **Severity:** Minor · **Found:** review 1 (frontend reviewer; confirmed for the markup)
- **Where:** `src/app/(public)/_components/language-switch.tsx:69-74`.
- **Problem:** on a Turkish page, "English" is spoken with Turkish rules, and the reverse (WCAG 2.2 SC 3.1.2, DEC-018). axe does not find this.
- **Fix:** wrap each label in `<span lang={language}>`.
- **Review 2:** fixed in `256317d`, checked by review 2.

### R-019 — At its own tree, the commit renders the page text in Arial, and its font claim is false

- **Status:** **Fixed (23ac1ee)** · **Severity:** Minor · **Found:** review 1 (frontend reviewer; confirmed by the main session: `git status` shows `src/app/globals.css` modified and not staged)
- **Where:** `src/app/fonts.css:4-5`; the body of `19b9f54`; the committed `src/app/globals.css` (the scaffold file).
- **Problem:** the committed `globals.css` sets `--font-sans: var(--font-geist-sans)` and `body { font-family: Arial, … }`, and it does not import `@heroui/styles`. At any commit of the branch, the text is in Arial and HeroUI has no CSS. DEC-015 and DEC-016 hold only with the owner's uncommitted file.
- **Fix:** the owner commits `src/app/globals.css` before the branch is pushed (Q-5). Then correct the header of `fonts.css` if it is still false.
- **Review 2:** fixed in `23ac1ee`, checked by review 2.

### R-020 — The fake of setLanguage in the component test is not typed to the action

- **Status:** **Fixed (3a77919)** · **Severity:** Minor · **Found:** review 1 (frontend reviewer; confirmed)
- **Where:** `src/app/(public)/_components/language-switch.test.tsx:8`, `:11-13`.
- **Problem:** `vi.fn()` and a factory that returns `unknown`. A change of `ActionResult` does not break the test build (`sds-testing`, **Type safety**).
- **Fix:** `vi.fn<typeof import("@/app/_actions/language").setLanguage>()`, and no `unknown` return.
- **Review 2:** fixed in `3a77919`, checked by review 2.

### R-021 — The read query of the log store is in src/lib, not in a repository of the platform module

- **Status:** **Fixed (41b3b1f)** · **Severity:** Note · **Found:** review 1 (backend reviewer; confirmed)
- **Where:** `src/lib/logging/store.ts:94-135`, `findLogRecords`.
- **Problem:** *Code layout* puts repositories in `src/modules/<module>/repositories/`. The write path must stay in `src/lib/`; the read serves only `GET /api/admin/logs`.
- **Fix:** none needed. *Code layout* in `core.md` now records that the logger reads and writes `platform_log_record` itself. Close this finding when a later review sees the record.
- **Review 2:** fixed in `41b3b1f`, checked by review 2. The spec text of *Code layout* records the log store; no code change.

### R-022 — The proxy matcher leaves out every path that starts with api

- **Status:** **Fixed (8b4cc73)** · **Severity:** Note · **Found:** review 1 (backend reviewer; confirmed by the main session)
- **Where:** `src/proxy.ts:41`, the pattern `(?!api|…)`.
- **Problem:** a later page such as `/apis` gets no CSP and no nonce.
- **Fix:** use `api(?:/|$)` in the pattern.
- **Review 2:** fixed in `8b4cc73`, checked by review 2.

### R-023 — The root layout has no locale provider for HeroUI

- **Status:** **Fixed (8a561f9)** · **Severity:** Note · **Found:** review 1 (frontend reviewer; confirmed for the code)
- **Where:** `src/app/layout.tsx:41-49`.
- **Problem:** React Aria takes its locale from the browser on the client and `en-US` on the server. B0 uses no HeroUI part with built-in text, so nothing fails yet (`sds-nextjs-frontend` §5).
- **Fix:** add the locale provider at the root before the first such part (B1 at the latest).
- **Review 2:** fixed in `8a561f9`, checked by review 2. The text still reaches the switch through props: R-046.

### R-024 — The failure sentence uses the muted token

- **Status:** **Fixed (1267122)** · **Severity:** Note · **Found:** review 1 (frontend reviewer; confirmed)
- **Where:** `src/app/(public)/_components/language-switch.tsx:77-84`.
- **Problem:** HeroUI paints `.alert__description` with `--muted`; the danger hue is only on the title and the indicator. The main failure text is grey secondary text.
- **Fix:** put the sentence in `Alert.Title` and the code in `Alert.Description`.
- **Review 2:** fixed in `1267122`, checked by review 2.

## Decisions

The reviewers judged the decisions that the developers took where the specs
gave no rule:

| Decision | Verdict | Recorded in |
|---|---|---|
| Index `(timestamp, id)` ascending, not DESC | Acceptable | `docs/plans/test_plan.md`, Data |
| An empty value is `CFG-5001`, also for an optional setting | Acceptable | FND-03 rule 3 (the code for numbers: R-004) |
| The seams need `APP_ENV` `development` or `test` | Acceptable, stricter than the old rule | FND-03 rule 4 |
| 405 after the credential check | Follows `code-prefixes.md` step 10 | `docs/plans/test_plan.md`, API |
| File sizes in decimal units | Acceptable | DEC-133 |
| RS256 only, from the configuration | Acceptable | R-015 (record beside the value) |
| A JWKS cache of its own (6 refetches in 60 s) | Acceptable, with R-003, R-005, R-015 | R-015 |
| `'unsafe-eval'` when `APP_ENV` is `development` | Defect | R-006; FND-07 rule 1 |
| `src/scripts/` and `NEXT_RUNTIME` read `process.env` | Acceptable | FND-03 rule 1 |
| 503 `SYS-5500` before the credential check while the configuration is unusable | Acceptable | This record |
| The log queue holds 10,000 records and never drops an `AUDIT` record | Acceptable | This record |
| `bp_lang` is `HttpOnly`, and `Secure` only for an HTTPS `PUBLIC_BASE_URL` | Acceptable | This record |
| `src/app/fonts.css` sets the font tokens outside `globals.css` | Acceptable: a font is not color or shape (DEC-015) | This record; R-019 |
| `ToggleButtonGroup` for the language | Correct control (`sds-nextjs-frontend` §5) | This record |

## Earlier findings

None. This is the first review of the project.
