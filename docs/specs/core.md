# Bioeksen Portal — Core

This file gives the decisions of scope, architecture, data, interface and
access. It also gives the items of the foundation (FND), identity and access
(ACC) and the platform services (PLT).
Read `README.md` first. It explains the IDs, the decision status and the build order.

## Decisions

Each row is one decision. The **Decision** column gives the rule that is in
force. A *Pending* rule stays in force until the owner answers.

### Scope and architecture

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-001 | Bioeksen Portal gives each person the correct IFU for the Bioeksen product and LOT that the person has (e-IFU, release 1). Later, it gives training (Academy, release 2). e-IFU and the Academy share one product identity. | Decided | PO | — | FND-01, CAT-10, ACD-20 | eng/project-overview.md §1–3 |
| DEC-002 | The portal is not a generic content system, learning system or document management system. Microservices, a public Academy sign-up, country-specific catalog numbers and a course builder that runs authored scripts are out of scope. | Decided | PO | — | IFU-10, ACD-30 | eng/project-overview.md §22 |
| DEC-120 | The only document type is `IFU`. | Decided | PO | — | IFU-10 | eng/data-model-fields.md §Document |
| DEC-003 | The app is one Next.js (App Router) app in TypeScript with `strict`, on Node.js 24 LTS. The package manager is pnpm. The app replaces the NestJS backend and the Vite frontend of the old ADRs. | Decided | PO | — | FND-01, FND-02 | Owner answer 2026-10-20; adr/0002, adr/0004, adr/0015; audit A-01, A-10 |
| DEC-004 | The app is a modular monolith: one deployable unit and one PostgreSQL 16 database. The modules are `identity`, `catalog`, `eifu`, `platform` and, in release 2, `academy`. The name of each table starts with the name of its module (`catalog_product`). The tables are in the schema `public`. Each worktree uses its own database: `bioeksen_portal_<role>_integration` or `bioeksen_portal_<role>_e2e`. This departs from `sds-database` §8 (one disposable schema for each worktree), because Prisma 8 adds the schema `public` to each table name. The departure ends when Prisma 8 accepts a schema for each connection. A module reads the data of another module only through the service of that module. | Default | ENG | — | FND-01, FND-06 | adr/0001; eng/architecture.md; Prisma 8 skill (`references/runtime.md`) |
| DEC-005 | Prisma 8 RC (`@prisma/orm-postgres` 8.0.0-rc.18, an exact version) is the only ORM. The contract `src/prisma/contract.prisma` is the source of truth. The contract holds each unique constraint, partial unique index and check constraint, with the name of the spec in `map:`. An extension, an exclusion constraint and a trigger are `rawSql` operations in the migration that creates or changes their table. A migration with raw SQL only is not possible, because Prisma 8 never applies a migration that does not change the contract. The drift check cannot see the raw objects, so an integration test proves that each one exists. | Decided | PO | — | FND-06 | Owner answer 2026-10-22; adr/0015; Prisma 8 skill (`references/migrations.md`) |
| DEC-006 | All production data is on infrastructure in Türkiye: the database, the object store, the cache, the backups, the logs and the mail relay. An external service that receives personal data or project data needs the approval of `PO` and `LEG` before its first use. | Decided | PO | questions.md 1 | FND-09, PLT-10, PLT-20, PLT-60 | adr/0006; audit D-2 |
| DEC-007 | Redis 7 holds the sessions and the rate-limit counters. Only PostgreSQL holds durable data. | Default | ENG | — | FND-04, ACC-20, IFU-50 | eng/tech-stack-versions.md |
| DEC-008 | The scheduled work runs in a worker process that is built from this repository. The worker runs one pass each hour. A PostgreSQL advisory lock lets only one instance run a pass at a time. | Default | ENG | — | PLT-30 | eng/backend-nestjs.md §Background work; ops/monitoring.md |
| DEC-130 | The Next.js configuration switches off `cacheComponents` and `partialPrefetching`. Partial Prerendering does not work with the nonce in the Content Security Policy of FND-07. | Default | ENG | — | FND-07 | `next/dist/docs/01-app/02-guides/content-security-policy.md` |
| DEC-131 | All code is under `src/`. The repository root holds only the configuration files. | Decided | PO | — | FND-01 | Owner answer 2026-10-22 |

### Data

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-009 | Internal keys are `bigint` columns that a sequence fills (`BIGSERIAL`). In JSON, they are strings. | Default | ENG | — | FND-06 | eng/data-model-fields.md §Primary keys; sds-api-design; Prisma 8 skill (`references/contract.md`) |
| DEC-121 | An identifier that an unauthenticated caller sees is a random UUID v4, never an internal key. | Default | ENG | — | IFU-50 | eng/data-model-fields.md §Primary keys |
| DEC-010 | The system never deletes a controlled record. The controlled records are a user, a role assignment, a product, a catalog number, a LOT, and a LOT import and its rows. The other controlled records are a document, a document version, a document file, a file replacement, an applicability period, an override and an access record. A state or an `isActive` flag ends a record instead. | Decided | PO | — | FND-06, ACC-10, ACC-31, CAT-10, CAT-20, CAT-40, CAT-60, IFU-10, IFU-20, IFU-30, IFU-32, IFU-40, IFU-80, ACD-50 | eng/data-model-fields.md §Deletion policy; eng/audit-traceability.md |
| DEC-011 | Record content that people read in two languages (a product name, a document title) is one JSONB column. It has one entry for each locale: `{ "tr": …, "en": … }`. Both entries are required. A check constraint enforces this. Interface text never uses this form. The dictionaries give the interface text. | Default | ENG | — | FND-08, CAT-10, IFU-10, ACD-20 | adr/0009; audit A-03 |
| DEC-012 | The database stores timestamps as `timestamptz`, in UTC. Business dates (a manufacturing date, an effective date, an expiry date) are `date` columns with no time. The interface shows timestamps and counts days in the time zone `Europe/Istanbul`. | Default | ENG | — | FND-08, CAT-40, IFU-30, IFU-83 | eng/localization.md §Data representation |
| DEC-133 | The interface shows a timestamp as `DD.MM.YYYY HH:mm` in Turkish and as `D MMM YYYY, HH:mm` in English (`10 Mar 2026, 00:30`), on the 24-hour clock, in the time zone of DEC-012. It shows a business date in the same form without the time. It shows a file size in decimal units with the symbols `B`, `kB`, `MB` and `GB` (1 kB is 1000 bytes), with at most one decimal, and a decimal comma in Turkish (`1,5 kB`, `2 MB`). | Default | ENG | — | FND-08 | B0 test review, 2026-10-22; reviews 1 and 2 |
| DEC-134 | The dependency check of FND-07 fails on an advisory of severity high or critical in any dependency, also a development tool. When a patched version exists, a pnpm override forces it. An advisory with no patched version is ignored only by its GHSA id, and only while this row names it with a review date. Ignored now: GHSA-vfj7-8cjw-p6xm (`braces` 3.0.3 and earlier, through `eslint-config-next`), review on 2027-01-22. | Decided | PO | — | FND-07 | Owner answer 2026-10-22 |
| DEC-135 | Until IT gives the Entra values and the test and production servers, the app runs as a demo. The demo is the app image with PostgreSQL 16, Redis 7, MinIO and Mailpit, from `compose.demo.yaml` on one machine, with `APP_ENV` `demo`. In the demo, the `ENTRA_*` settings are optional. When they are not set, `GET /api/health` and `GET /api/admin/logs` answer 503 `AUTH-5500`, and the app still reports ready. The test seams stay closed. Each other rule of `production` also applies to `demo`. The demo is not for real users. | Pending | IT | questions.md 27 | FND-02, FND-03, FND-04 | Owner answer 2026-10-22 |
| DEC-039 | In JSON, a business date is `YYYY-MM-DD`, with no time and no offset. This departs from `sds-api-design` (`standard-api-endpoints.md`, **Types and units**). That skill gives each date an offset. The departure ends when SDS answers. | Pending | SDS | questions.md 2 | CAT-40, IFU-30, IFU-60, IFU-83 | — |

### Errors and audit

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-013 | An API failure carries only a code of the `bioeksen-sds` registry (`sds-logging`). A domain refusal is `RES-4302` when the state of the addressed record does not allow the action. A domain refusal is `VAL-4006` when a field holds a value outside the values that the rule allows. This case also covers a record that exists and does not qualify. The system writes the rule in `message`, and in the tail of the log record as `reason=<rule>`. The second case reads step 19 of `code-prefixes.md` widely, until SDS answers. | Pending | SDS | questions.md 2 | FND-05, CAT-60, IFU-30, IFU-50, IFU-70 | adr/0014 §3; eng/error-codes.md; audit D-7 |
| DEC-122 | The interface shows the localized text for the code and the field of a failure, with the code beside it. It never shows the answer's `message`. If a call gets no answer in the form of `sds-api-design` (the network fails, or the server action is unknown), the interface shows the localized text of a failed call, with no code. | Default | ENG | — | FND-08, IFU-70 | sds-nextjs-frontend §6; review 1 Q-4 |
| DEC-014 | For each controlled change, the app writes one row of `platform_audit_record` and one `AUDIT` log record, in the transaction of the change. The row names the actor, the action code, the entity type and id, the state before and after, and the request id. Where the action needs a reason, the row also names the reason. | Default | ENG | — | PLT-40, ACC-31, CAT-41, IFU-30, IFU-40, IFU-82 | eng/audit-traceability.md; sds-database §5; owner answer 2026-10-22 (no `@bioeksen/sdk`) |
| DEC-127 | The app writes its log records through an in-app logger (`src/lib/logging`), not through `@bioeksen/sdk`. The logger writes records in the form of `sds-logging` (`log-record.md`) to stdout and to the local store `platform_log_record`. It sends nothing to the log aggregator. This departs from `sds-logging` (**Bindings**, **Transport**) and from `sds-nextjs-backend` §3. The departure ends when `@bioeksen/sdk` is available to this app. | Decided | PO | questions.md 24 | FND-04, FND-05, PLT-40, PLT-70 | Owner answer 2026-10-22 |

### Interface

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-015 | The interface uses HeroUI v3 and Tailwind CSS v4. `src/app/globals.css` is the only source of color and shape. It holds the brand ramp (`theme-*`), the neutral ramp (`neutral-*`) and the HeroUI tokens that it maps to these ramps. It also holds the radius values, the region class `.sidebar-theme` and the dark theme (`[data-theme="dark"]`). No other file adds a color. Warning and danger keep the hues of HeroUI, as the file says. | Decided | PO | — | FND-09 | Owner answers 2026-10-20 (HeroUI; adhere to `app/globals.css`); the brand values of adr/0010 are not used; audit A-06, A-07 |
| DEC-016 | The interface shows text in IBM Plex Sans. Business identifiers (catalog numbers, LOT numbers, revision labels, dates, hashes) are in IBM Plex Mono. No other text is in IBM Plex Mono. The app serves both faces from its own origin, in the weights 400, 500 and 600, with the subsets `latin` and `latin-ext`. Headings use the weight 600. | Decided | PO | — | FND-09, IFU-70 | adr/0010; eng/design-system.md; audit A-08, D-9 |
| DEC-017 | The interface is in Turkish and English. Turkish is the default. The preferred language of a signed-in user has priority. Otherwise, the language that the person chose last applies. A cookie keeps this choice. | Default | PO | — | FND-08, IFU-70 | eng/localization.md |
| DEC-018 | The public lookup and the primary flows of the backoffice meet WCAG 2.2 level AA. | Default | ENG | — | FND-09, IFU-70, ACD-30, ACD-70 | eng/accessibility.md |
| DEC-019 | The interface never shows a state by color alone. Each state has an icon and a text label. A found document gets no success color and no success banner. The interface uses strong color only for problems. | Decided | PO | — | FND-09, IFU-70 | adr/0010; eng/design-system.md |

### Delivery

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-020 | Unit and integration tests run on Vitest. End-to-end tests run on Playwright. Integration tests use a real, disposable PostgreSQL 16. | Default | ENG | — | FND-02 | eng/testing.md |
| DEC-021 | Commits follow `sds-commit`. The software id is `bioeksen-portal`. The file `.bioeksen/software-id` holds it. The `Change-Id:` trailers and the log records carry it (`sds-logging`). | Pending | SDS | questions.md 3 | FND-01, FND-02 | audit A-03, A-13 |
| DEC-022 | `main` is the releasable branch. The team works on short branches. Each change reaches `main` through a pull request, after CI passes. | Default | ENG | — | FND-02 | eng/git-workflow.md; audit A-12 |
| DEC-126 | No environment other than production holds production personal data. The one exception is the quarterly restore drill (PLT-60). The second custodian destroys the database of the drill when its check ends. | Default | ENG | — | PLT-60 | eng/privacy-data-residency.md §Data residency; ops/backup-restore.md §The quarterly drill |
| DEC-128 | A release tag starts the deployment, through the deploy repository of IT, as `sds-ci` says (**Releases and deployment**). The app repository holds no deployment job, and a merge into `main` deploys nothing. | Pending | IT | questions.md 25 | FND-02 | sds-ci |
| DEC-136 | Crisis mode (`crisis_mode.md`) is in force from 2026-10-22. B1 to B4 are built in this order for each stage: the contract, a skeleton on typed mock services, the frontend, the backend, and a review of the commits of the stage. No new test is written until B4 is built. Then the tester writes the acceptance tests of B0 to B4: unit, then integration, then e2e. B5 follows. This departs from `sds-planning` (**The stage loop**: the tests come before the build), from `sds-testing` (acceptance tests ahead of the code, and a test in each `feat` or `fix` commit) and from `sds-reviewing` (a full review). It also departs from `sds-commit` on `Test-Exempt`: a crisis `feat` or `fix` commit carries `Test-Exempt: acceptance`, and the test phase writes its tests. The departures end when the test phase after B4 passes, or when the owner ends crisis mode. | Decided | PO | — | FND-02 | Owner answer 2026-10-22 |

### Identity and access

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-023 | One person has one user account for every area. An administrator creates the account. The person opens it through an emailed invitation. Nobody creates their own account. | Decided | PO | — | ACC-10, ACC-40 | eng/project-overview.md §7; adr/0011 |
| DEC-024 | Staff sign in with an email address and a password. The session is a server-side record. A cookie with `HttpOnly`, `Secure` and `SameSite=Lax` names the session. | Decided | PO | — | ACC-20 | adr/0003 |
| DEC-025 | A session ends after 60 minutes without a request, and after 12 hours in total. | Default | ENG | — | ACC-20 | — |
| DEC-026 | One sign-in serves everybody. After sign-in, the permissions that a person holds decide what the person sees. The page where the person signed in does not decide it. | Decided | PO | — | ACC-50, ACD-10 | adr/0011; audit D-8 |
| DEC-027 | The system limits the failed sign-ins of each source address to 10 in one minute (`sds-auth`). After 5 consecutive failed sign-ins with an email address, the system locks that email address for 15 minutes. This applies whether or not the email address has an account. | Default | ENG | — | ACC-20 | eng/error-codes.md §Authentication; sds-auth §What a rejection may say |
| DEC-028 | A password has 15 to 128 characters. It does not hold the email address of the account. It is not on the common-password list. There are no composition rules (NIST SP 800-63B revision 4, for a password used alone). | Default | ENG | — | ACC-10 | eng/error-codes.md §AUTH_PASSWORD_TOO_WEAK |
| DEC-123 | An invitation link works for 14 days. A reset link works for 1 hour. Each link works once. A new link for the same purpose ends the earlier link. | Default | ENG | — | ACC-10 | eng/data-model-fields.md §AuthToken |
| DEC-029 | An authorization check names a permission code, never a role. A role is a named bundle of permissions. In release 1, each grant of a role applies to the whole platform. The Academy adds grants that apply to one organization (DEC-102). | Default | ENG | — | ACC-30, ACD-10 | eng/permission-matrix.md |
| DEC-030 | Only a holder of `iam.role.manage` grants or revokes a role. Nobody grants a role to themselves. The system audits each grant and each revocation. | Decided | PO | — | ACC-31 | eng/permission-matrix.md §Role assignment scope (decided 2026-08-23) |
| DEC-031 | Each permission has one test that allows and one test that refuses. | Default | ENG | — | ACC-30 | eng/testing.md §Authorization |
| DEC-038 | The source address of a request is the rightmost `X-Forwarded-For` entry that a proxy in `TRUSTED_PROXIES` did not add. This follows the rule of `sds-auth` for rate limits. If a proxy in `TRUSTED_PROXIES` added each entry, the source address is the leftmost entry. In all other cases, the source address is never the leftmost entry. | Default | ENG | — | FND-04, ACC-20, IFU-50, IFU-80, FND-03 | eng/eifu-resolution-specification.md §Access recording; sds-auth §Rate limiting; review 1 Q-1 |

### Platform services

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-032 | The app builds a file key from record ids and the SHA-256 of the bytes, never from a file name. A write never replaces an object. | Default | ENG | — | PLT-10, IFU-20, IFU-32 | eng/object-storage.md §Key naming |
| DEC-124 | The app never deletes the stored object of a controlled file. The documents bucket has no expiry rule. | Default | ENG | — | PLT-10, IFU-32 | eng/object-storage.md §Deletion |
| DEC-125 | The app gives a signed download URL only after it authorizes the caller for that file. | Default | ENG | — | PLT-10, IFU-60 | eng/object-storage.md §Signed URLs |
| DEC-132 | A signed download URL uses the public endpoint of the object store, `S3_PUBLIC_ENDPOINT_URL`. When that setting is not set, the URL uses `S3_ENDPOINT_URL`. | Pending | IT | questions.md 26 | FND-03, PLT-10, IFU-60 | — |
| DEC-033 | The app sends mail through one SMTP relay in Türkiye, with STARTTLS (or TLS on port 465). The app sends a message after the transaction commits, never inside it. A message never carries a document, a signed storage URL or a password. | Default | ENG | — | PLT-20, ACC-10, IFU-50, ACD-80 | eng/notifications.md; ops/incidents.md |
| DEC-034 | IT watches the app with an uptime check outside the host and with the app's log records (PLT-70), inside Türkiye. IT gets an alert within 15 minutes when `GET /api/health/ready` fails for 2 minutes, or when the TLS certificate expires within 14 days. IT also gets this alert when more than 2 percent of the answers in 10 minutes are 5xx. The same applies when a mail send fails, when an object-store call fails, or when no pass of PLT-30 ends for 3 hours. The same applies when no backup succeeds for 26 hours, or when a disk is more than 80 percent full. | Pending | IT | questions.md 23 | PLT-60, PLT-70 | adr/0018 §Consequences; ops/monitoring.md §Alerts; audit D-2 |
| DEC-035 | Each night, the backup job makes a dump of the database. It encrypts the dump before the dump touches a disk. The host keeps 7 days of dumps. An off-host bucket in Türkiye keeps 90 days. | Pending | QA | questions.md 20 | PLT-60 | ops/backup-restore.md |
| DEC-036 | After a restore, the app applies again every erasure that occurred after the time of the dump. It does this before it serves traffic. The administrator keeps the reference of each erasure request outside the database for this purpose. | Pending | LEG | questions.md 21 | PLT-60, IFU-82 | audit D-1 |
| DEC-037 | The text-size preference has the steps 75, 87.5, 100, 112.5, 125, 150 and 200 percent of the browser's own size. Only text scales. | Pending | PO | questions.md 22 | ACC-60 | eng/design-system.md §Type size; audit D-9 |

## Code layout

All code is under `src/` (DEC-131).

- `src/app/` holds the routes, the server actions and the pages. They stay
  thin: each one builds the context of the caller, validates the input, calls
  one service function and maps the result (`sds-nextjs-backend` §1).
- `src/modules/<module>/services/` and `src/modules/<module>/repositories/`
  hold each module of DEC-004. A service never imports the repositories of
  another module.
- `src/lib/` holds the shared code: the configuration module, the database
  client, the error class and the logger (DEC-127). The logger writes to
  and reads from `platform_log_record` itself, because `src/lib/` never
  imports a module. It also holds the
  dictionaries (`src/lib/i18n/dictionaries/`), the formatters and the zod
  schemas. `src/lib/` never imports `src/modules/`.
- `src/prisma/` holds the contract and the migrations (DEC-005).
  `src/worker/` holds the entries of the worker process (DEC-008) and of the
  bootstrap command (ACC-40).
- `src/proxy.ts` and `src/instrumentation.ts` are the Next.js proxy and the
  start hook.
- `.bioeksen/software-id` holds the software id (DEC-021).
- `AGENTS.md` and `CLAUDE.md` refer to these files. They also name the
  commands and the paths that the `bioeksen-sds` skills require. They hold no
  rule of their own.

## Foundation

This section gives the repository, the pipeline and the shared mechanisms that
every later item uses. In the acceptance criteria, "fails" means that the
command, the pipeline or the request ends with an error that names the cause,
and nothing changes.

### FND-01 Repository and toolchain

**What.** One repository with one Next.js app, and the commands that check it.

**Rules.**
1. The app is one Next.js app (DEC-003). All code is under `src/` (DEC-131).
   The package manager is pnpm. The repository holds the lock file.
2. `package.json` has the scripts `typecheck`, `lint`, `test`,
   `test:integration`, `test:e2e` and `build`.
3. The code follows the layout above and the layers of `sds-nextjs-backend`
   §1 (DEC-004). ESLint enforces the import rules of the layout.
4. `.bioeksen/software-id` holds the software id (DEC-021).
5. Each module that names a product uses the one product identity of DEC-001.

**Acceptance.**
- **AC1.** When `pnpm install --frozen-lockfile` runs on a clean checkout of
  `main`, and then `pnpm run typecheck`, `pnpm run lint` and `pnpm run build`
  run, each exits 0.
- **AC2.** If a file under `src/app/` imports a repository, `pnpm run lint` fails
  and names the file.
- **AC3.** If a file of one module imports a repository of another module,
  `pnpm run lint` fails and names the file.
- **AC4.** If a file under `src/lib/` imports a file under `src/modules/`,
  `pnpm run lint` fails.

**Trace.** eng/repository-structure.md; audit A-01, A-03, A-04

### FND-02 Continuous integration

**What.** A pipeline that checks each change.

**Rules.**
1. The pipeline follows `sds-ci`. On each pull request, it runs these steps in
   this order:
   1. the type check and the lint;
   2. the unit tests;
   3. the production build of the Next.js app (DEC-003);
   4. the integration tests and the end-to-end tests against disposable
      database services (DEC-020).
2. The pipeline also runs the drift check of FND-06 and the `sds-planning`
   checker with `--tests` over the acceptance folders. It also runs the commit
   check of the `bioeksen-sds` kit (DEC-021).
3. A pull request merges into `main` only when every check passes (DEC-022).
4. A release tag starts the deployment, through the deploy repository of IT
   (DEC-128). The app repository holds no deployment job.
5. Until the test environment exists, the demo of DEC-135 stands in for it.
   The repository holds `compose.demo.yaml` and the image definition that it
   builds (`sds-ci`, **The container image**).

**Acceptance.**
- **AC1.** If a pull request has a type error, a lint error, a failed test or
  a failed build, the pipeline fails. In this case, the pull request cannot
  merge.
- **AC2.** If an acceptance test cites a criterion that does not exist in
  `docs/specs`, the pipeline fails.
- **AC3.** If a commit of a pull request does not follow `sds-commit`, the
  pipeline fails. If the `Change-Id:` trailer of a commit in a pull request
  does not carry the software id of DEC-021, the pipeline also fails.
- **AC4.** When IT deploys a release tag to the test environment,
  `GET /api/health/ready` answers 200 there.
- **AC5.** When a person starts `compose.demo.yaml` with the values of
  `.env.example` on a machine with Docker, `GET /api/health/ready` of the demo
  answers 200 within 3 minutes.

**Trace.** eng/git-workflow.md; eng/definition-of-done.md; sds-ci §The jobs

### FND-03 Configuration

**What.** One configuration module that reads, checks and types every
setting.

**Rules.**
1. One module reads `process.env`, once, at start. It checks `process.env`
   with a zod schema (`sds-config`). No other file of the app reads
   `process.env`. Two exceptions: the scripts in `src/scripts/`, which are
   separate processes, and `NEXT_RUNTIME` in `src/instrumentation.ts`.
2. The settings are:

| Setting | Required | Default |
|---|---|---|
| `APP_ENV` (`development`, `test`, `demo` or `production`; DEC-135) | yes | — |
| `DATABASE_URL`, `REDIS_URL` | yes | — |
| `S3_ENDPOINT_URL`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes | — |
| `S3_PUBLIC_ENDPOINT_URL` (DEC-132) | no | the value of `S3_ENDPOINT_URL` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | yes | — |
| `PUBLIC_BASE_URL` | yes | — |
| `TRUSTED_PROXIES` (the proxy addresses, DEC-038) | in production | — |
| `EIFU_LEGAL_NOTICE_VERSION` | yes | — |
| `EIFU_IDENTITY_KEYS` (`id:base64key`, newest first; each key decodes to 32 bytes, the key of AES-256-GCM (DEC-081); each id once; IFU-90) | in production | — |
| `EIFU_IDENTITY_LOOKUP_PEPPER` (at least 32 characters; IFU-90) | in production | — |
| `EIFU_ACCESS_RECORD_RETENTION_DAYS` | no | as DEC-080 says |
| The values of `sds-auth` (`credentials.md`, **Configuration**): `ENTRA_TENANT_ID`, `ENTRA_ISSUER`, `ENTRA_JWKS_URI`, `ENTRA_JWKS_MAX_AGE_SECONDS`, `ENTRA_AUDIENCE`, `ENTRA_CLIENT_ID`, the client credential, `ENTRA_OPERATOR_SCOPE`, `AUTH_CLOCK_SKEW_SECONDS` | as `sds-auth` says; when `APP_ENV` is `demo`, the `ENTRA_*` settings are all set or all not set (DEC-135) | as `sds-auth` says |
| `LOG_LEVEL` (`sds-logging`) | no | `INFO` |
| `TEST_SEAMS_ENABLED` | no | `false` |
| `BOOTSTRAP_ADMIN_EMAIL` (only the command of ACC-40 reads it) | no | — |

3. If a required setting is not set, the code is `CFG-5000`. If the app
   cannot use a value, the code is `CFG-5001`. An empty value is a value that
   the app cannot use, also for an optional setting. In both cases, the app does not
   report ready. It writes a `FATAL` record that names the setting and never
   its value (`sds-config`; `sds-testing`, `contract-tests.md`,
   **Configuration**).
4. The test seams (a test sign-in, an injected clock, a fake mail transport)
   work only when these two conditions are true (`sds-testing`,
   **Test seams**):
   - `TEST_SEAMS_ENABLED` is `true`;
   - `APP_ENV` is `development` or `test`. A missing or unknown `APP_ENV`
     keeps the seams closed.

**Acceptance.**
- **AC1.** If `DATABASE_URL` is not set when the app starts,
  `GET /api/health/ready` answers 503 before any other request, and a `FATAL`
  record with `CFG-5000` names `DATABASE_URL`.
- **AC2.** If `EIFU_IDENTITY_LOOKUP_PEPPER` has fewer than 32 characters when
  `APP_ENV` is `production`, the app does not report ready. A `FATAL` record
  with `CFG-5001` names the setting and does not hold its value.
- **AC3.** If `TEST_SEAMS_ENABLED` is `true` when `APP_ENV` is `production`,
  the app does not report ready, a `FATAL` record carries `CFG-5001`, and no
  test seam works.
- **AC4.** If `ENTRA_ISSUER` is not set when the app starts and `APP_ENV` is
  not `demo`, the app does not report ready, and a `FATAL` record carries
  `CFG-5000`.
- **AC5.** If no `ENTRA_*` setting is set when the app starts and `APP_ENV` is
  `demo`, the app reports ready, and `GET /api/health` with a bearer token
  answers 503 `AUTH-5500`.

**Trace.** sds-config; sds-auth (credentials.md §Configuration); adr/0017 item 7; ops/deploy.md

### FND-04 Standard endpoints

**What.** The four endpoints that `sds-api-design` requires of every app.

**Rules.**
1. The app serves `GET /api/health`, `GET /api/health/live`,
   `GET /api/health/ready` and `GET /api/admin/logs`, with the paths, the
   schemas and the principals of `sds-api-design` and `sds-auth`.
2. The readiness check covers PostgreSQL and Redis. The full report also
   covers the object store (`object-store`) and the mail relay (`smtp`) under
   its dependencies. Without these two, the app degrades: an upload or a code
   mail fails, and the app continues to serve the other requests.
3. `GET /api/admin/logs` reads the local store `platform_log_record`
   (DEC-127).
4. A failed authentication at `GET /api/health` or `GET /api/admin/logs`
   counts against its source address (DEC-038). The limit is 10 failures in
   one minute, in Redis (DEC-007; `sds-auth`, **Rate limiting**).

**Acceptance.**
- **AC1.** When the database does not answer, `GET /api/health/live` answers
  200, and `GET /api/health/ready` answers 503 with the body `status` `fail`.
- **AC2.** When PostgreSQL and Redis answer and the object store and the mail
  relay do not answer, `GET /api/health/ready` answers 200. In this case,
  `GET /api/health` answers 200 with the body `status` `ok`, and reports
  `object-store` and `smtp` as `fail`.
- **AC3.** If a request to `GET /api/health` or `GET /api/admin/logs` has no
  `Authorization` header, the answer is 401 `AUTH-4100`.
- **AC4.** Each answer of the four endpoints carries
  `Cache-Control: no-store`.
- **AC5.** When one source address sent 10 requests with a failed
  authentication to `GET /api/health` in one minute, the 11th request in that
  minute answers 429 `RATE-4400` with a `Retry-After` header. This is also
  true when the 11th request has a valid operator token.

**Trace.** sds-api-design (standard-api-endpoints.md §Further dependencies); adr/0014; audit A-17

### FND-05 Errors, logs and correlation

**What.** One error shape, one code for each failure, and one request id
across the answer and its log records.

**Rules.**
1. The app logs through its in-app logger (DEC-127), in the record form of
   `sds-logging`.
2. Every failure answer uses the error envelope of `sds-api-design`. The app
   chooses its code as DEC-013 says. A server action returns the same
   envelope.
3. The answer's code and the code of the failure's log record are the same.
4. Every answer carries `X-Request-Id`, as `sds-logging` says.
5. A log record never holds a password, a token, a session id or a
   verification code. It also never holds a signed URL, the email address of a
   lookup or a full client address.
6. An operation that has no code yet answers 500 `SYS-5000` (`sds-logging`,
   **Not implemented**).
7. The body limit is 1 MiB (1,048,576 bytes), except where an item records
   another limit: IFU-20 and CAT-60.

**Acceptance.**
- **AC1.** When a request arrives without `X-Request-Id`, the answer carries a
  new one. When a request arrives with one, the answer carries the same value.
- **AC2.** When a request fails, the answer's `code` and the `code` of its log
  record are the same, and both carry the same request id.
- **AC3.** If a request body has a field that the endpoint does not define,
  the answer is 400 `VAL-4007`, and `details` names the field.
- **AC4.** When the app logs a verification request (IFU-50), no log record
  holds its email address, its code or the full client address.
- **AC5.** If a request body is larger than the limit of its endpoint, the
  answer is 413 `VAL-4550`.

**Trace.** sds-logging; sds-api-design; eng/logging-observability.md; eng/object-storage.md §Signed URLs; audit D-7

### FND-06 Data layer

**What.** The schema, the migrations and the guards around them.

**Rules.**
1. The Prisma schema is the source of truth (DEC-005). Tables follow DEC-004.
   Keys follow DEC-009.
2. Migrations are forward-only. After a migration applies to a database that
   is not disposable, nobody edits it (`sds-database` §4).
3. A drift check compares the schema and the migrations.
4. The integration suite runs only against a database whose name ends in
   `_integration` (`sds-testing`, **Test databases**).
5. On each table of a controlled record (DEC-010), a row trigger refuses a
   `DELETE`. A statement trigger on the same table refuses a `TRUNCATE`.

**Acceptance.**
- **AC1.** If the Prisma schema and the migrations disagree, the drift check
  fails.
- **AC2.** If the name of the integration database does not end in
  `_integration`, the suite refuses to run and changes nothing.
- **AC3.** When the migrations apply to an empty PostgreSQL 16, each named
  constraint and trigger of `catalog.md` and `eifu.md` exists in the database.
- **AC4.** If a `DELETE` statement targets a row of a controlled record, the
  database refuses it, and the row stays.
- **AC5.** If a `TRUNCATE` statement targets a table of a controlled record,
  the database refuses it, and the rows stay.

**Trace.** eng/database-migrations.md; adr/0015; sds-database

### FND-07 Request security

**What.** The headers and the checks that protect every page and request.

**Rules.**
1. Each HTML answer carries a Content Security Policy. Its `script-src` holds
   `'self'` and a nonce that is new for each answer. The `script-src` holds
   neither `'unsafe-inline'` nor `'unsafe-eval'`. Its `style-src` holds
   `'self'` and `'unsafe-inline'`, for the style attributes that React
   renders. Its `frame-ancestors` is `'none'`. For this reason, the Next.js
   configuration follows DEC-130. Only the development server (`next dev`)
   adds `'unsafe-eval'`, which it needs. A production build never adds it.
2. Each answer carries `Strict-Transport-Security` with `max-age=31536000`,
   `X-Content-Type-Options: nosniff` and
   `Referrer-Policy: strict-origin-when-cross-origin`.
3. A route handler that changes state and reads the session cookie checks
   that `Origin` is the origin of `PUBLIC_BASE_URL` (`sds-nextjs-backend` §3).
   The Next.js origin check of server actions stays on.
4. The app never renders HTML that a person supplied. It never runs a script
   that an administrator supplied.
5. The pipeline checks the dependencies for known vulnerabilities
   (DEC-134).

**Acceptance.**
- **AC1.** Each HTML answer carries a `Content-Security-Policy`, also the
  answer to a prefetch of the browser. Its `script-src` has a nonce that differs from the nonce of the previous answer.
  The `script-src` has no `'unsafe-inline'` and no `'unsafe-eval'`. Its
  `frame-ancestors` is `'none'`.
- **AC2.** Each answer carries `Strict-Transport-Security` with `max-age` of at
  least 31536000.
- **AC3.** If a request to a route handler meets all of these conditions, the
  answer is 401 `AUTH-4101`, and nothing changes:
  - the request changes state;
  - it carries a valid session cookie;
  - it carries an `Origin` that is not the origin of `PUBLIC_BASE_URL`.
- **AC4.** If a call to a server action carries an `Origin` that does not
  match the host, the app refuses the action, and nothing changes.
- **AC5.** If the pipeline finds a dependency with a known vulnerability of
  severity high or critical, the pipeline fails.

**Trace.** eng/security.md; sds-nextjs-backend §3

### FND-08 Languages and formats

**What.** The dictionaries, the choice of language, and the formats of dates,
times and sizes.

**Rules.**
1. Interface text comes from `src/lib/i18n/dictionaries/`. `tr.ts` is the source.
   `en.ts` takes its type from `tr.ts` (`sds-nextjs-frontend` §6). The text of
   a failure follows DEC-122.
2. The language follows DEC-017. `<html lang>` gives the active language.
3. Record content in two languages follows DEC-011.
4. The formatters of the project format the dates, the times and the file
   sizes, with the time zone of DEC-012 and the forms of DEC-133.
5. The interface never changes text to capital letters with `text-transform`.
   In Turkish, this gives wrong letters. If a label must show in capital
   letters, the dictionary holds it in capital letters.

**Acceptance.**
- **AC1.** If a key is in `tr.ts` and not in `en.ts`, `pnpm run typecheck`
  fails.
- **AC2.** When a person without a language cookie opens a page, the page is
  in Turkish with `<html lang="tr">`.
- **AC3.** When the person chooses English, the page shows in English with
  `<html lang="en">`.
- **AC4.** When a person who chose English returns, the page is in English.
- **AC5.** When a signed-in user whose preferred language is English opens a
  page, the page is in English, also when the language cookie says Turkish.
- **AC6.** When the interface shows the timestamp `2026-03-09T21:30:00Z`, it
  shows `10.03.2026 00:30` in Turkish and `10 Mar 2026, 00:30` in English.

**Trace.** eng/localization.md; eng/design-system.md §Typography

### FND-09 Interface base

**What.** The palette, the faces and the shared rules of every page.

**Rules.**
1. The interface uses `src/app/globals.css` without change (DEC-015,
   `sds-nextjs-frontend` §4). Components use HeroUI v3 only
   (`sds-nextjs-frontend` §5).
2. The faces follow DEC-016. No page loads a font, a script, a style or an
   image from another host (DEC-006).
3. States follow DEC-019. Pages meet DEC-018.

**Acceptance.**
- **AC1.** When the public lookup page or the sign-in page loads, the browser
  requests nothing from a host other than the app's origin.
- **AC2.** When the contrast table of the `sds-nextjs-frontend` reference page
  reads `src/app/globals.css`, the result is as follows. Each pair of the light
  theme, the dark theme and the region `.sidebar-theme` meets the contrast
  minimums of WCAG 2.2 level AA.
- **AC3.** When a page shows a catalog number, a LOT number, a revision label
  or a manufacturing date, that text is in IBM Plex Mono. The label of that
  text is in IBM Plex Sans.
- **AC4.** If axe-core runs on each of three pages, it reports no violation of
  WCAG 2.2 level A or AA. The three pages are the public lookup page, the
  sign-in page and the backoffice start page.

**Trace.** eng/accessibility.md; audit A-06, A-07, A-08

## Identity and access

The module `identity` keeps the users, the sessions, the roles and the
permissions. In the acceptance criteria, "fails" means that the system
refuses the action with the code that the criterion names, and no row
changes.

### ACC-10 Users and invitations

**What.** An administrator creates a user, and the person opens the account
through an emailed invitation.

**Rules.**
1. Nobody creates their own account (DEC-023).
2. When the system creates a user, it sends an invitation (PLT-20, DEC-033) in
   the preferred language of the user. The link holds a random 256-bit token.
   The database keeps only the SHA-256 hash of the token. The link follows
   DEC-123.
3. To open the account, the person sets a password that follows DEC-028.
4. Deactivation ends every session of the user. The user row stays (DEC-010).
   Nobody deactivates their own account.
5. A holder of `organization.users.view` can list users. A holder of
   `organization.users.manage` can create, re-invite and deactivate users
   (ACC-30).
6. The system audits each creation, invitation and deactivation (PLT-40).

**Data.** `identity_user`: the email address (unique without regard to
letter case), the first name, the last name, the preferred language (`tr` or
`en`), `is_active`. `identity_auth_token`: the user, the purpose
(`INVITATION` or `PASSWORD_RESET`), the token hash (unique), `expires_at`,
`used_at`, the creator; one unused token for each user and purpose.

**Screens.** Backoffice › Users: the list, the creation form, and the actions
re-invite and deactivate.

**Acceptance.**
- **AC1.** When a holder of `organization.users.manage` creates a user, the
  user exists with `isActive` true and no password. One invitation mail goes
  to the email address of the user.
- **AC2.** If the email address already belongs to a user, in any letter case,
  the creation fails with 409 `RES-4300`.
- **AC3.** When the person opens the invitation link within 14 days and sets a
  valid password, the person can sign in. A second use of the same link fails
  with 401 `AUTH-4101`.
- **AC4.** If the invitation link is older than 14 days, a request to set a
  password fails with 401 `AUTH-4102`.
- **AC5.** If the new password has one or more of these defects, the request
  to set it fails with 400 `VAL-4006`:
  - it has fewer than 15 characters;
  - it holds the email address of the account;
  - it is on the common-password list.

  `details` names each rule that the password breaks.
- **AC6.** When an administrator re-sends an invitation, the earlier link no
  longer works.
- **AC7.** When an administrator deactivates a user, each session of that user
  ends, and the user row stays.
- **AC8.** If a user deactivates their own account, the action fails with 403
  `PERM-4150`.

**Trace.** eng/data-model-fields.md §User, §AuthToken; ops/deploy.md

### ACC-11 Password reset

**Acceptance.**
- **AC1.** When a person requests a password reset, the answer is the same
  whether or not the email address belongs to an active user. A mail goes
  only to an active user.
- **AC2.** When the person uses the reset link within 1 hour and sets a valid
  password, the password changes. Every other session of the user ends.
- **AC3.** If the reset link is older than 1 hour, the reset fails with 401
  `AUTH-4102`.
- **AC4.** If the reset link was used before, the reset fails with 401
  `AUTH-4101`.
- **AC5.** If the new password is the current password, the reset fails with
  400 `VAL-4006`.

### ACC-20 Sign-in and sessions

**What.** Staff sign in once, and each session ends at the correct time.

**Rules.**
1. Sign-in uses an email address and a password (DEC-024). Sessions follow
   DEC-024 and DEC-025. Redis holds the sessions (DEC-007).
2. A wrong password, an unknown email address and an inactive account get the
   same answer (`sds-auth`, **What a rejection may say**).
3. The system limits failed sign-ins as DEC-027 says, with the source address
   of DEC-038. A limited request gets 429 `RATE-4400` with `Retry-After`.
4. A sign-in issues a new session id. A sign-out ends the session.
5. The system logs every sign-in decision as `SECURITY` (`sds-logging`).

**Screens.** The sign-in page, and the page where a person requests a
password reset.

**Acceptance.**
- **AC1.** When an active user signs in with the correct email address and
  password, the answer sets a session cookie. The cookie has `HttpOnly`,
  `Secure` and `SameSite=Lax`. The next request is signed in.
- **AC2.** If the password is wrong, the email address has no user, or the
  user is inactive, the sign-in fails with 401 `AUTH-4101`. The three answers
  have the same body.
- **AC3.** When the 11th failed sign-in from one source address arrives within
  one minute, the answer is 429 `RATE-4400` with a `Retry-After` header.
- **AC4.** When an account has 5 consecutive failed sign-ins, a sign-in to it
  within the next 15 minutes fails with 429 `RATE-4400`. This is also true
  with the correct password. After 15 minutes, the correct password works.
- **AC5.** When an email address with no account has 5 consecutive failed
  sign-ins, the 6th sign-in to it within 15 minutes fails with 429
  `RATE-4400`. This is the same as for an account.
- **AC6.** If a signed-in user makes no request for 60 minutes, the next
  request is not signed in.
- **AC7.** If a session is 12 hours old, the next request is not signed in.
- **AC8.** When a user signs out, a request with the old cookie is not signed
  in.
- **AC9.** When a user signs in, the new session id differs from each session
  id that the browser had before.

**Trace.** adr/0003; adr/0011; eng/error-codes.md §Authentication

### ACC-30 Permissions and roles

**What.** The permission registry of release 1 and its two roles.

**Rules.**
1. Every check names a permission (DEC-029). Each permission has one test that
   allows and one test that refuses (DEC-031).
2. A request to a backoffice API without a session gets 401 `AUTH-4100`. If a
   person opens a backoffice page without a session, the app sends the person
   to the sign-in page. A request without the permission gets 403
   `PERM-4150`.
3. The registry of release 1:

| Permission | Allows |
|---|---|
| `catalog.product.view` | View products and catalog numbers |
| `catalog.product.manage` | Create and change products |
| `catalog.catalog_number.manage` | Create and change catalog numbers |
| `catalog.lot.view` | View LOTs and LOT imports |
| `catalog.lot.manage` | Register LOTs and run LOT imports |
| `catalog.lot.correct` | Correct a LOT's manufacturing date, with a reason |
| `eifu.document.view` | View documents, versions, files, periods and overrides |
| `eifu.document.manage` | Create documents and versions, and upload files to a `DRAFT` version |
| `eifu.document.publish` | Publish a `DRAFT` version |
| `eifu.document.withdraw` | Withdraw a version, with a reason |
| `eifu.document.replace_published_file` | Replace a file of a published version, with a reason |
| `eifu.lot_override.manage` | Create and end overrides, with a reason |
| `eifu.access_record.view_aggregated` | View the aggregated lookup report |
| `eifu.access_record.view_raw` | View individual access records, and read an identity with a reason |
| `organization.users.view` | List users |
| `organization.users.manage` | Create, re-invite and deactivate users |
| `iam.role.manage` | Grant and revoke roles |
| `platform.system.administer` | Erase the identity of a person from the access records after an erasure request |

4. The roles of release 1:

| Role | TR | Holds |
|---|---|---|
| IFU Manager | *IFU Yöneticisi* | Every `catalog.*` and `eifu.*` permission, except `eifu.access_record.view_raw` |
| Platform Administrator | *Platform Yöneticisi* | Every permission of the registry |

**Data.** `identity_permission` (the code, unique), `identity_role` (the
code, the name) and `identity_role_permission`. `identity_role_assignment`
(the user, the role, `is_active`, the granter, the time; one active assignment
for each user and role).

**Acceptance.**
- **AC1.** If a request to a backoffice API has no session, the answer is 401
  `AUTH-4100`. If a person opens a backoffice page without a session, the app
  sends the person to the sign-in page.
- **AC2.** This criterion applies to each permission of the registry. When a
  user who holds the permission through a role does the action that it
  allows, the action succeeds. When a user who does not hold the permission
  does the action, the action fails with 403 `PERM-4150`.
- **AC3.** When a user holds the IFU Manager role, the user holds each
  `catalog.*` and `eifu.*` permission except `eifu.access_record.view_raw`, and
  no other permission.
- **AC4.** When a role assignment is revoked, the user's next request no
  longer has the permissions of that role.

**Trace.** eng/permission-matrix.md; audit D-10

### ACC-31 Role assignment

**Acceptance.**
- **AC1.** When a holder of `iam.role.manage` grants a role to another active
  user, the assignment is active. One `AUDIT` record names the actor, the
  user, the role and the time (DEC-014, DEC-030).
- **AC2.** If a user grants a role to themselves, the grant fails with 403
  `PERM-4150`, also when the user is a Platform Administrator.
- **AC3.** If the user already holds the role, the grant fails with 409
  `RES-4300`.
- **AC4.** When a role is revoked, the assignment stays with `isActive` false
  (DEC-010). The system writes one `AUDIT` record.
- **AC5.** If a user who holds `organization.users.manage` and not
  `iam.role.manage` grants a role, the grant fails with 403 `PERM-4150`.

### ACC-40 Bootstrap

**What.** A command that brings the roles and the permissions to the registry,
and creates the first administrator.

**Rules.**
1. `pnpm run bootstrap` makes the permissions, the roles and their bundles in
   the database match ACC-30. It runs on every release, after the migrations.
2. While no active Platform Administrator exists, it creates one for the
   email address in `BOOTSTRAP_ADMIN_EMAIL` and sends an invitation (DEC-023).
   It sets and prints no password.
3. Migrations never run when the app starts. The release runs them as a step
   of their own.

**Acceptance.**
- **AC1.** When bootstrap runs on an empty database with
  `BOOTSTRAP_ADMIN_EMAIL`, a user with the Platform Administrator role exists.
  One invitation mail goes to the email address. The output holds no
  password.
- **AC2.** If bootstrap runs while no active Platform Administrator exists and
  `BOOTSTRAP_ADMIN_EMAIL` is not set, it exits with code 2 and changes no
  user.
- **AC3.** When bootstrap runs while an active Platform Administrator exists,
  it creates no user.
- **AC4.** When ACC-30 gains a permission, the next bootstrap run adds it and
  its role bundles. A second run changes nothing.

**Trace.** ops/deploy.md §4

### ACC-50 Landing after sign-in

**What.** The page that a person reaches after sign-in, and the entry page of
the portal.

**Rules.**
1. The page after sign-in follows DEC-026.
2. In release 1, a user who holds any permission of ACC-30 reaches the
   backoffice start page after sign-in. Release 2 adds the Academy (ACD-10).
3. `/` is the entry page. It offers the public lookup (IFU-70) and the
   sign-in. It needs no session.

**Acceptance.**
- **AC1.** When a user who holds a permission of ACC-30 signs in, the user
  reaches the backoffice start page.
- **AC2.** When a user who holds no permission signs in, the user reaches a
  page that says that the account has no area yet. The page offers sign-out.
- **AC3.** When a person opens `/` without a session, the page offers the
  public lookup and the sign-in.

**Trace.** adr/0011; eng/eifu-domain.md §The public address; audit D-8

### ACC-60 Text size

**What.** A signed-in user chooses the text size of the interface (release
2).

**Rules.**
1. The steps follow DEC-037. The choice sets a percentage on the root
   element. Only text scales. The spacing stays in pixels.
2. The choice is a field of `identity_user`. It applies on each device where
   the user signs in.

**Acceptance.**
- **AC1.** When a user chooses a text size, each page sets the root font size
  to that percentage. The choice stays after the next sign-in.
- **AC2.** When the text size is 200 percent at a width of 1280 px, no text of
  the backoffice pages is clipped. No text covers other text.

**Trace.** eng/design-system.md §Type size; audit D-9

## Platform services

The module `platform` gives the services that other modules use: file
storage, mail, scheduled jobs, audit records, backups and operational
signals. In the acceptance criteria, "fails" means that the system refuses
the action with the code that the criterion names, and no row changes.

### PLT-10 File storage

**What.** Private storage for controlled files, with signed download URLs.

**Rules.**
1. The store and its buckets are in Türkiye (DEC-006). Each bucket is
   private.
2. The bucket `<S3_BUCKET>-documents` holds the IFU files. It has versioning
   on (DEC-124).
3. A file key is `documents/{documentId}/{versionId}/{languageCode}/{sha256}.pdf`
   (DEC-032). A write sends `If-None-Match: *`, so that the store refuses to
   replace an object.
4. A signed URL follows DEC-125 and uses the endpoint of DEC-132. Only the
   server holds the store's credentials.

**Acceptance.**
- **AC1.** When the app stores a file, its key holds ids and the SHA-256 of
  its bytes. The key holds no part of the uploaded file name.
- **AC2.** If a write targets a key that exists, the write fails, and the
  stored object stays the same.
- **AC3.** When the bucket configuration is read, the documents bucket has
  versioning on and no expiry rule.
- **AC4.** If the object store does not answer, a request that needs it fails
  with 503 `UP-5500`, and `GET /api/health/ready` still answers 200.

**Trace.** eng/object-storage.md; ops/deploy.md §2

### PLT-20 Mail

**What.** One way to send mail, outside the transaction.

**Rules.**
1. The app sends mail as DEC-033 says, through a relay in Türkiye (DEC-006).
2. A code mail of the public lookup holds Turkish and English in one body,
   because the visitor has no stored language. An invitation and a reset use
   the user's preferred language.
3. A link in a message starts with `PUBLIC_BASE_URL`, never with the host of
   the request.
4. The system logs a failed send with its `UP-` code and without the email
   address of the recipient (PLT-70). A failed send never undoes the business
   change.
5. A message holds no image and no link that tracks the recipient.

**Acceptance.**
- **AC1.** When the system sends an invitation, the link in it starts with
  `PUBLIC_BASE_URL`, also when the request's `Host` header names another host.
- **AC2.** If the relay refuses a message after the transaction committed,
  the business change stays. The system writes a log record with `UP-5000`,
  without the email address of the recipient.
- **AC3.** If the relay offers no STARTTLS on a port other than 465, the app
  sends nothing and logs `UP-5000`.

**Trace.** eng/notifications.md; adr/0018; ops/incidents.md

### PLT-30 Scheduled jobs

**What.** A worker process that runs the scheduled jobs.

**Rules.**
1. The worker follows DEC-008.
2. The jobs of release 1 are:
   - the identity re-encryption (IFU-90);
   - the retention pass (IFU-81);
   - the removal of verifications that ended more than 24 hours before
     (IFU-50).
3. Each job logs its start, its end and its failure as `JOB` (PLT-70). A
   failed job does not stop the other jobs of the pass.

**Jobs.** One pass each hour, in the worker process.

**Acceptance.**
- **AC1.** When two worker instances start a pass at the same time, only one
  of them runs the jobs.
- **AC2.** If one job fails, the other jobs of the pass run. The failure has a
  log record of type `JOB` with the code `JOB-5000`.

**Trace.** eng/backend-nestjs.md §Background work; ops/monitoring.md

### PLT-40 Audit records

**What.** The audit record of each controlled change.

**Rules.**
1. Audit records follow DEC-014. The `AUDIT` log record follows DEC-127.
2. The audited actions are the ones that the items mark as audited. The
   action code has the form `<module>.<entity>.<verb>`, for example
   `eifu.document_version.published`.
3. An audit record never holds the email address or the client address of a
   lookup visitor.

**Acceptance.**
- **AC1.** When an audited action succeeds, exactly one `AUDIT` record exists
  for it. The record names the actor, the action code, the entity type and
  id, the state before and after, and the request id.
- **AC2.** If the transaction of an audited action ends with a rollback, no
  `AUDIT` record of it remains.
- **AC3.** When an audited action succeeds, its `AUDIT` row in the local log
  store holds the same request id as its row of `platform_audit_record`. The
  pass that removes old log rows never removes an `AUDIT` row.
- **AC4.** When an action that needs a reason succeeds, its `AUDIT` record
  holds the reason.

**Trace.** eng/audit-traceability.md; sds-database §5; sds-logging

### PLT-60 Backups

**What.** Encrypted backups in Türkiye, and a tested restore.

**Rules.**
1. Backups follow DEC-035, in Türkiye (DEC-006). The backup job encrypts the
   dump with `age` before the dump touches a disk. The host holds only the
   public key.
2. The app's storage key cannot write to the off-host backup bucket.
3. Nobody stores the backup identity, the identity key ring or the lookup
   pepper beside the backups (DEC-083).
4. Once each quarter, the second custodian restores the last dump on a
   machine that is not production. Then the custodian checks the restored
   database and destroys it (DEC-126).
5. A restore follows DEC-036. After a restore, the operator records the time
   between the dump and the incident. The operator tells `QA` that the access
   records of that time are lost.
6. The backup job logs its result as `JOB` (PLT-70). Its alert follows
   DEC-034.

**Jobs.** One backup each night at 02:30 Europe/Istanbul.

**Acceptance.**
- **AC1.** When the backup job runs, a new encrypted dump is in the off-host
  bucket. Nobody can read the dump without the backup identity.
- **AC2.** When the dump is decrypted and restored into an empty PostgreSQL
  16, four row counts equal the counts of the source. These are the counts of
  products, LOTs, document versions and access records at the time of the
  dump.
- **AC3.** If a request with the app's storage key writes to the off-host
  backup bucket, the store refuses it.
- **AC4.** When a restore completes, the app applies again each erasure
  recorded after the time of the dump, before it serves traffic.

**Trace.** ops/backup-restore.md; eng/privacy-data-residency.md; audit D-1

### PLT-70 Operational signals

**What.** The log records that IT's alerts read.

**Rules.**
1. The alerts follow DEC-034. They read the app's log records (DEC-127) and
   an uptime check of `GET /api/health/ready`.
2. For a failed call to a dependency, the app logs the `UP-` code of the
   failure. The tail of the record holds the name of the dependency:
   `dependency=smtp` or `dependency=object-store`.
3. Each pass of PLT-30 and each backup (PLT-60) logs one `JOB` record at its
   end: `INFO` when it succeeds, `JOB-5000` when it fails.
4. The app has no metrics endpoint, because the `operator` role of `sds-auth`
   is for people only. A system that monitors the app is itself an app.

**Acceptance.**
- **AC1.** When a mail send fails, one log record carries an `UP-` code and
  `dependency=smtp`. The record does not hold the email address of the
  recipient.
- **AC2.** When an object-store call fails, one log record carries an `UP-`
  code and `dependency=object-store`.
- **AC3.** When a pass of PLT-30 ends, one `JOB` record at `INFO` names the
  pass and the time of its end.
- **AC4.** When the backup job fails, one `JOB` record carries `JOB-5000`.

**Trace.** ops/monitoring.md; adr/0018; sds-auth (credentials.md §Roles)
