# Stage B0: Foundation

**Items.** FND-01 to FND-03, FND-04 (AC1 to AC4), FND-05 (AC1, AC2, AC3, AC5), FND-06 (AC1, AC2),
FND-07 (AC1, AC2, AC4, AC5), FND-08 (AC1 to AC4, AC6), FND-09 (AC2).

**Exit criterion.** CI runs every check of FND-02 on a pull request. IT
deploys a release tag of the empty app to the test environment (DEC-128).
There, `GET /api/health/ready` answers 200. The `sds-planning` checker passes
on the set.

**Pending rules in force.**
- DEC-013: a failure carries only a code of the `bioeksen-sds` registry.
- DEC-021: the software id is `bioeksen-portal`, in `.bioeksen/software-id`.
- DEC-128: a release tag starts the deployment; this repository holds no
  deployment job.

**Decisions this stage carries.** DEC-003, DEC-004, DEC-005, DEC-009,
DEC-015, DEC-016, DEC-017, DEC-018, DEC-020, DEC-022, DEC-127, DEC-130,
DEC-131, DEC-133.

## Contract

The acceptance tests reach the code only through the names below.

### API

Every answer carries `X-Request-Id`. The four standard endpoints carry
`Cache-Control: no-store`. Their bodies and codes are the ones of
`sds-api-design` (`references/openapi.yaml`); this table does not repeat them.

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/health/live` | — | 200, the `sds-api-design` live body | — |
| `GET /api/health/ready` | — | 200, `status` `ok`, checks `db` and `cache` | 503, `status` `fail` or `not-ready`, no `code` |
| `GET /api/health` | `Authorization: Bearer <operator token>` | 200, the full report; `checks.dependencies` holds `object-store` and `smtp`; 200 `ok` also when only these two fail (FND-04.AC2) | 401 `AUTH-4100`, `AUTH-4103`, `AUTH-4102`, `AUTH-4101`; 503 `AUTH-5500`; 403 `PERM-4151` |
| `GET /api/admin/logs` | operator token; the query of `sds-api-design` | 200, the list body of `sds-api-design`, from `platform_log_record` | as `GET /api/health`; 400 `VAL-4003`, `VAL-4004`, `VAL-4005` |
| Another method on the four paths | — | — | 405 `RES-4500` with `Allow`, after the credential check (`code-prefixes.md` step 10) |
| `POST /api/test/echo` (test seam) | JSON body `{ "value": string }`, body limit 1 MiB | 200 `{ "status": "ok", "value": … }` | 400 `VAL-4000`, `VAL-4001`, `VAL-4007`; 413 `VAL-4550`; 404 when the seams are off |

Server action (FND-08): `setLanguage(language: "tr" | "en")` in
`src/app/_actions/language.ts`. It sets the cookie `bp_lang` for 365 days and
answers the `sds-api-design` envelope.

### Data

| Table | Columns and constraints | Migration |
|---|---|---|
| `platform_log_record` | `id` BIGSERIAL primary key; `software_id` text; `timestamp` timestamptz(3); `severity` text; `type` text; `code` text, optional; `message` text; `shipped_at` timestamptz, optional | `src/prisma/migrations/app/<ts>_platform_log_record` (skeleton: the table and its columns only) |
| `platform_log_record` | checks `log_record_severity_is_known` (DEBUG, INFO, WARNING, ERROR, FATAL), `log_record_type_is_known` (APP, SECURITY, AUDIT, ACCESS, JOB), `log_record_message_length` (at most 8192); indexes on (`timestamp`, `id`), (`code`), (`type`, `severity`); PostgreSQL reads the first one backward for the newest first (Prisma 8 keeps no sort direction in an index) | `<ts>_platform_log_record_constraints` (build) |
| — | `rawSql`: the function `platform_refuse_delete()`, for the DELETE and TRUNCATE triggers of the controlled tables of later stages (FND-06 rule 5) | the same build migration |

### UI

| Page or component | Accessible names | Dictionary keys |
|---|---|---|
| `src/app/layout.tsx`: `<html lang>` from the session (B1) or the cookie `bp_lang`, else `tr` | — | — |
| `src/app/(public)/page.tsx`: a placeholder entry page | the language switch: `common.language.switch` | `common.language.tr`, `common.language.en`, `common.language.switch`, `home.title` |
| `src/app/(public)/_components/language-switch.tsx` (HeroUI) | as above | as above |

### Exports that tests can call

| Export | Path | For |
|---|---|---|
| Route handlers `GET` of the four standard endpoints, `POST` of the echo seam | `src/app/api/**/route.ts` | FND-04, FND-05 |
| `formatDateTime(instant: Date, locale: "tr" \| "en"): string` | `src/lib/format/date-time.ts` | FND-08.AC6 |
| `dictionaries` (`tr`, `en`) | `src/lib/i18n/dictionaries/` | FND-08.AC1 |

### Test seams

- The seams work only when `TEST_SEAMS_ENABLED` is `true` and `APP_ENV` is
  not `production` (FND-03 rule 4).
- **Operator token:** the integration global setup starts a local JWKS
  server. `ENTRA_JWKS_URI` points to it. A helper mints tokens with and
  without the operator scope and role, expired tokens and tokens with a wrong
  signature.
- **Echo route:** `POST /api/test/echo` proves the body checks of the route
  wrapper.
- **Logs:** a test reads log records through `GET /api/admin/logs` with an
  operator token, or from the stdout of a spawned app.
- **Spawned app:** a helper starts `next start` on a free port with a given
  environment, for the configuration and header criteria.

## Skeleton

The developer builds this before any behavior, so that the tests compile and
fail for the missing behavior.

1. Move `app/` to `src/app/`; set the `tsconfig.json` path `@/*` to
   `./src/*`; `next.config.ts` without `cacheComponents`,
   `partialPrefetching` and `experimental.agentFeedback` (DEC-130).
2. Add the dependencies of the plan (Prisma CLI, `pg`, `zod`, `server-only`,
   `redis`, `jose`, the HeroUI packages, the `@fontsource` IBM Plex packages;
   dev: `vitest`, `@playwright/test`, `@axe-core/playwright`, Testing Library,
   `jsdom`, `esbuild`). Pin exact versions of the Prisma packages.
3. `.nvmrc` (24), `.bioeksen/software-id` (`bioeksen-portal`),
   `compose.dev.yaml`, `.env.example`.
4. `package.json` scripts: `typecheck`, `lint`, `test`, `test:integration`,
   `test:pipeline`, `test:e2e`, `test:results`, `build`, `prebuild`,
   `contract:emit`, `db:migrate`, `db:check`.
5. Runner configuration: `vitest.config.ts` (projects `unit`, `component`,
   `integration`, `pipeline`), `playwright.config.ts`, the database guard and
   the global setup in `tests/support/`.
6. Modules with their final names and signatures, whose bodies throw
   `NotImplemented`: `src/lib/config`, `src/lib/errors`, `src/lib/logging`,
   `src/lib/request-context`, `src/lib/http`, `src/lib/db`, `src/lib/auth`,
   `src/lib/format`, `src/lib/i18n`, `src/lib/security`.
7. Route handlers at their final paths that answer 500 `SYS-5000`.
8. `src/proxy.ts` and `src/instrumentation.ts` that do nothing yet.
9. The skeleton migration of `platform_log_record`.
10. The dictionaries `tr.ts` and `en.ts` with the keys of the UI table.

## Tasks

| Task | Closes | Tier for each criterion |
|---|---|---|
| T1 Toolchain, layout and import rules | FND-01.AC1 to AC4 | AC1 pipeline (the commands on a clean copy); AC2 to AC4 pipeline (ESLint on fixture source text with a file path under `src/`) |
| T2 Pipeline proposal and commit check | FND-02.AC1 to AC4 | AC1 to AC3 pipeline (fixtures); AC4 e2e smoke test against the test environment, run at the stage exit |
| T3 Configuration and start hook | FND-03.AC1 to AC4 | e2e (spawned app with a broken environment) |
| T4 Standard endpoints and operator tokens | FND-04.AC1 to AC4 | AC1 e2e (spawned app with a database that does not answer); AC2 to AC4 integration |
| T5 Errors, logger, request id, route wrapper | FND-05.AC1, AC2, AC3, AC5 | integration |
| T6 Data layer and drift check | FND-06.AC1, AC2 | pipeline |
| T7 Headers, nonce, proxy, server action origin, dependency check | FND-07.AC1, AC2, AC4, AC5 | AC1, AC2 e2e; AC4 integration; AC5 pipeline |
| T8 Languages, formats, layout, fonts | FND-08.AC1 to AC4, AC6 | AC1 pipeline (type check of a fixture dictionary); AC2 to AC4 e2e; AC6 unit |
| T9 Contrast of `src/app/globals.css` | FND-09.AC2 | unit (the pairs of the `sds-nextjs-frontend` reference page, read from the CSS file) |

**The order.** T1, T3, T5, T6, T4, T7, T8, T9, T2. The spike of DEC-005 comes
first in T6: the build migration with its `rawSql` function applies to an
empty database, and `db verify` passes.

## Fixtures and helpers

- `tests/support/db-guard.ts`: it refuses a database whose name does not end
  in `_integration` or `_e2e`, or whose host is not in `TEST_DATABASE_HOSTS`.
- `tests/support/global-setup/`: recreate the disposable database, apply the
  migrations, start the JWKS server.
- `tests/support/operator-token.ts`, `tests/support/spawn-app.ts`,
  `tests/support/results.ts` (the results-only runner).
- `tests/README.md`: the tiers, the folders, the helpers, how a test cites its
  criterion.

## Open point for the exit

`src/app/globals.css` fails pairs of the reference page of
`sds-nextjs-frontend` at WCAG 2.2 AA (measured by the B0 tests, 2026-10-22):

- Light theme, 8 pairs: link on the page 4.28; accent text on the page 4.28;
  primary button, hovered 3.99; soft warning chip 4.21; danger, solid 3.48;
  error text on a surface 3.57; placeholder 2.64; field edge 1.00.
- Dark theme, 11 pairs: muted text on a surface 3.94; accent text on a
  surface 4.32; primary button 4.32; primary button, hovered 3.77; soft accent
  chip 4.45; success, solid 4.32; soft success chip 4.45; danger, solid 4.35;
  soft danger chip 3.42; error text 2.33; field edge 1.25.
- The region `.sidebar-theme`: 8 pairs in the light theme and 8 in the dark
  theme.

FND-09.AC2 stays red until the file changes, and the stage cannot exit with a
red criterion. The owner changes the file before the exit.

## Answers to the test questions (2026-10-22)

- FND-09.AC2 measures `.sidebar-theme` in both themes, as the reference page
  does. The pairs that come from the HeroUI tokens count too.
- FND-03.AC3 now says "no test seam works". In B0, the seam is
  `POST /api/test/echo`, which answers 404.
- FND-04 rule 4 and AC5 (the rate limit of failed authentication, `sds-auth`)
  are new. AC5 is due in B1, with the rate limits of ACC-20.
- FND-04.AC2 now gives the status of `GET /api/health`: 200 `ok`.
- FND-08.AC6 now gives the forms of DEC-133.
- FND-02.AC1: the pipeline runs `test:pipeline` too (`sds-ci`).
- FND-02.AC3 and FND-07.AC5: no local script runs the commit check or the
  audit. The tests read the workflow. A person commits the workflow
  (`sds-ci`).
