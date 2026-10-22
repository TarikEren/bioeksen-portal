# Scaffold and documentation audit — 2026-10-20

| | |
|---|---|
| **Scope** | `docs/**`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.claude/**`; `package.json`, `app/` and git state as context |
| **Goal checked against** | Bioeksen Portal (`bioeksen-portal`): e-IFU now, Academy (training) later — `docs/engineering/project-overview.md` |
| **Status** | Open. Sections A–F and H are for the product owner to resolve. Section G lists the errors that were fixed |

Line numbers are from before the fixes in section G. In the files that section
changed, a line can be off by one or two.

## Summary

1. **The scaffold contradicts the accepted architecture.** The repo is a
   Next.js 16 app. ADR-0004 rejects Next.js by name, and ADR-0002/0015 set a
   NestJS backend plus a Vite React SPA in `backend/` and `frontend/`. No ADR
   records a change.
2. **The docs describe a built system that is not in this repo**: `backend/`,
   `frontend/`, `Makefile`, `scripts/`, `infra/`, CI, "427 passing tests". Decide
   if `docs/` is a target specification or a record of an earlier codebase.
3. **`AGENTS.md` describes another application from end to end**, and
   `CLAUDE.md` loads it into every session. Its software id would go into
   every `Change-Id:` trailer. (Resolved on 2026-10-20.)
4. **The UI scaffold (HeroUI, Fluent palette, Geist) contradicts ADR-0010**
   (brand tokens, IBM Plex). `app/globals.css` imports `@heroui/styles`, which is
   not installed, so `next build` fails.
5. No string "BioeksenPortal" exists anywhere. The other-app names are in
   section B.
6. The docs also have many internal conflicts (section D), broken references
   (section E) and ADR process problems (section F). 13 plain errors were fixed
   (section G).

---

## A. Scaffold vs the project goal

| ID | Where | Finding | Conflicts with |
|---|---|---|---|
| A-01 | `package.json`, `next.config.ts`, `app/` | One Next.js 16.4.2 app, no backend. | ADR-0004:51-53 rejects Next.js ("would add a Node runtime… keep inside Türkiye"). ADR-0002:15 (`backend/`, `frontend/`, `infra/`, `scripts/`). ADR-0015:42 ("frontend stays React + Vite"). `tech-stack-versions.md` (no Next.js row). `repository-structure.md:7-35`. No ADR supersedes them. |
| A-02 | `docs/**` | The docs speak of code that exists: "427 passing tests" (ADR-0014:108), "all 57 `@RequirePermission` sites" (`deferred-work.md:34`), "Six of those screens now exist as code" (`claude-tooling.md:31`), "What CI already proved" (`operations/README.md:32-39`), `make verify` everywhere. | The repo has one commit ("Initial commit from Create Next App") and none of `backend/`, `frontend/`, `Makefile`, `scripts/`, `infra/`, `.github/`, `RUNNING.md`, `.env.example`. |
| A-03 | `AGENTS.md` (whole file) | Described another application: its id, its purpose, its documents, its branches, its layout, its helpers, its schemas and its commands. Nothing in it applied to this project. | Resolved on 2026-10-20: `AGENTS.md` now describes Bioeksen Portal. |
| A-04 | `CLAUDE.md` | `@AGENTS.md` only, so every Claude session loaded the other application's file. | `claude-tooling.md:14-15` (CLAUDE.md holds the invariants; AGENTS.md is "the same for non-Claude agents"). `repository-structure.md:9-10, 41-43` (two short adapters that point into `docs/engineering/`). `privacy-data-residency.md:45` cited CLAUDE.md for a fact it does not hold (fixed, E-12). |
| A-05 | `README.md` | Empty (0 bytes). The create-next-app README was deleted. | `repository-structure.md:11` expects one. `local-development.md:15` points to `RUNNING.md`, which does not exist. |
| A-06 | `.claude/skills/heroui-react/` | HeroUI v3 skill (Tailwind v4, oklch tokens). | No doc names a component library. ADR-0010 and `design-system.md:47-62` set a two-layer token system in `frontend/src/styles/tokens.css`. `frontend-react.md:3-4` (components use `var(--color-action)`). |
| | `SKILL.md:117-170` | Setup uses `npm i` and `postcss.config.mjs`. | The repo uses pnpm and `@tailwindcss/turbopack` (`next.config.ts`); no `postcss.config.*`. |
| | — | The agents expect the skill at `.agents/skills/heroui-react/` (`nextjs-frontend-developer.md:28-30`). | It is at `.claude/skills/heroui-react/`. |
| A-07 | `app/globals.css` | "Fluent ramp" (`--theme-primary: #3a7f62`), Fluent neutral greys (`#323130`, `#605e5c`), HeroUI tokens (`--accent`). | ADR-0010: brand `#479876`, action `#387D60`, brand grey `#5D6061`, semantic `--color-*` tokens. |
| | `app/globals.css:~99` | "the palette carries no amber or red". | ADR-0010:40-41 (red, amber and blue ramps for states). |
| | `app/globals.css` | Separate `--success` hue. | ADR-0010:54-63 ("no separate success hue"). |
| | `app/globals.css` | Dark theme and `.sidebar-theme` are defined. | `design-system.md:352-366` (dark theme not in scope; hook stays empty). |
| A-08 | `app/layout.tsx` | Geist from `next/font/google`, `latin` subset only; `<html lang="en">`; title "Create Next App". | ADR-0010:65-72 (IBM Plex via `@fontsource`, `latin` + `latin-ext`, which Turkish needs). `localization.md` (Turkish and English UI). |
| A-09 | `app/globals.css:2` | **Error, not fixed.** Imports `@heroui/styles`, but `package.json` has no `@heroui/*` and `node_modules/@heroui` is absent. `next build` fails. | The fix depends on A-06. |
| A-10 | `package.json`, `pnpm-lock.yaml` | pnpm 12.11.2. | `tech-stack-versions.md:26-27` (npm, `package-lock.json`), `local-development.md:7` ("Node.js 26 and npm"), `AGENTS.md:189`, heroui `SKILL.md:120`. |
| A-11 | `package.json` | `@types/node ^20`, `typescript ^5`. | `tech-stack-versions.md:11-12` (Node 26; TypeScript 6.x backend). |
| A-12 | git | Only `master` exists. | `git-workflow.md:5, 9` (`main`). |
| A-13 | `git-workflow.md:12-35` | Plain Conventional Commits: no `Change-Id:` trailer; type list has `ci`; scopes `eifu, academy, catalog, iam, audit, infra`. | ADR-0014:96 (commits follow `sds-commit`, including `Change-Id:`). The scopes do not match `architecture.md:15-27`. |
| | `git-workflow.md:32-33` | No AI attribution line in a commit. | Claude Code adds a `Co-Authored-By` line by default. ADR-0014:97-98 says this rule wins; it needs a setting or an instruction to hold. |
| A-14 | `.claude/agents/*.md` | All four target "a Next.js App Router" codebase and read `.agents/skills/{nextjs-backend,frontend,testing,reviewing}/SKILL.md`, which do not exist. `nextjs-backend-developer.md:47-53` cites rules of the other application. (Paths and rules resolved on 2026-10-20.) | `claude-tooling.md:17, 104-106` (four **review** subagents, including `migration-safety-reviewer`). `testing.md` rules (21 e-IFU vectors, a positive and a negative test per permission, a real PostgreSQL per run) are not in `qa-engineer.md`. |
| A-15 | `.claude/settings.local.json` | Allow rules for the paths and the URLs of the other application. | None of these paths exist here. The rules were removed on 2026-10-20. |
| A-16 | `.claude/launch.json` | Configs of the other application. | Replaced on 2026-10-20 by one `dev` config for this app. |
| A-17 | `.claude/settings.json` | Enables `bioeksen-sds@bioeksen-skills` and `typescript-lsp`. Consistent with ADR-0014. | `claude-tooling.md:19, 75` says the plugin is enabled in *user* settings (it is project settings) and does not list `typescript-lsp`. ADR-0014:137-140, ADR-0015:124-126 and `claude-tooling.md:85-87` say the sds skills do not load; they are now installed (0.8.0, 0.9.0). The plugin now has more than the four skills the docs name: `sds-ci`, `sds-config`, `sds-database`, `sds-planning`, `sds-reviewing`, `sds-testing`, `sds-nextjs-backend`, `sds-nextjs-frontend`. |
| A-18 | `claude-tooling.md:16, 18, 108` | `.claude/skills/bioeksen-portal-engineering/` (the "engineering constitution"), `.claude/commands/` (four slash commands: `/check-invariants`, `/adr`, `/review-dod`, `/new-domain-app`). | Neither exists. ADR README:9 ("a fixed platform decision in `SKILL.md`") points at the missing skill. |
| A-19 | `AGENTS.md` (old version, `git show HEAD:AGENTS.md`) | The deleted `nextjs-agent-rules` block says `next dev` writes it back. | If Next.js stays, expect the block to return to `AGENTS.md`. |

## B. Names of other apps

| Name | Where |
|---|---|
| "BioeksenPortal" | No occurrence anywhere in the repo. |
| The other application's name, id and module paths | `AGENTS.md`, `.claude/settings.local.json`, `.claude/launch.json`. Removed on 2026-10-20. |
| "BioBI" | `deferred-work.md:157` ("The BioBI report designer has undo/redo"). Another product. Confirm the comparison is intended. |
| "Create Next App", Next.js/Vercel | `app/layout.tsx:16-17`, `app/page.tsx`, `public/next.svg`, `public/vercel.svg`. |
| Company name casing | "BioEksen" in ADR-0014:1, 8, 16; ADR-0015:18, 142; `adr/README.md:59`. "Bioeksen" everywhere else (`organization-model.md:28`: "Bioeksen Ar-Ge Teknolojileri A.Ş."). Pick one. |
| Country name | "Turkey" in `object-storage.md:139-140`, `project-overview.md:48, 259`; "Türkiye" in ADR-0006 and `privacy-data-residency.md`. |

## C. Stale technology inside the docs

ADR-0015 replaced Django with NestJS + Prisma. These still present Django or
Python as current:

- **ADR-0001:16, 26** — "one Django project", `transaction.atomic()`. ADR-0015:132 says 0001 "stands".
- **ADR-0003:1, 31, 50** — Django sessions. The index marks the implementation obsolete; the file does not.
- **ADR-0004:28, 34-35** — "calling the Django API"; "No Node.js process in production… Django + nginx". NestJS is a Node process, yet ADR-0015:135 says 0004 "stands, untouched".
- **ADR-0010:76-77**, **ADR-0014:115** — enforcement by Python scripts and `make check`.
- **ADR-0015:58** — `backend/apps/lots/tests/lot_number_vectors.json` (a Django path) "survives unchanged". `eifu-resolution-specification.md:647-649` names `shared/vectors/lot-number.json` instead.
- **`data-model-fields.md`** — `TextChoices` (:15), `BigAutoField`/`UUIDField` (:21), `ExclusionConstraint`, `RangeOperators`, `Q(...)` (:210-219), `document_version__status` (:226), `USERNAME_FIELD` (:358), `UniqueConstraint(..., nulls_distinct=False)` (:419-427, :500), `PROTECT` (Prisma has `Restrict`).
- **`eifu-resolution-specification.md:5, 21-26, 137`** — "The Django implementation… is being deleted" (present tense); `backend/apps/eifu/services.py`; Django table names called "the current physical names".
- **`performance.md:13`** — `select_related`/`prefetch_related` (Django ORM).
- **`localization.md:14, 18`** — "Python/TypeScript identifiers", "docstrings".
- **`privacy-data-residency.md:94`** — "never hard-coded in Python or TSX".
- **`git-workflow.md:62-63`** — "migrations to the same app… dependency graphs" (Django migration model; Prisma has none).
- **`state-machines.md`, `data-model-fields.md:191, 237`** — snake_case Python service names (`publish_document_version`, `submit_course_for_review`) next to TypeScript names (`LotOverrideService.create`). `backend-nestjs.md:18-22` uses camelCase.
- **Python governance scripts** — `coding-standards.md:20-27`, `dependencies.md:22` (`pyproject.toml`), `local-development.md:9-12, 75, 90-91, 105-109` (uv, pytest, ruff, `python3 scripts/*.py`), `claude-tooling.md:119-123`. `local-development.md:11` says a system Python is not needed, then :105-109 call `python3`.
- **`api-conventions.md:9-13`, `eifu-domain.md:23`** — trailing-slash paths (`/api/v1/eifu/resolve/`, DRF style). ADR-0018 and the spec use no slash.

## D. Conflicts between documents, and with the ADRs

### D-1 Retention and encryption (ADR-0007/0016/0017/0018)
- ADR-0007 contradicts itself: "retention period decided 2026-08-23" (:4) vs "No final retention period is approved" (:54); "Indefinite" (:43) vs "five years" (:76, :84).
- ADR-0016 says it carries 0007's questions "unchanged" (:10-11, :97), but drops 0007:101-103 (align with IVDR ten years?).
- ADR-0017:49 ("Retiring a key is the retention mechanism") vs ADR-0018:58-59 (the 3650-day anonymisation pass), while 0018:5-6 says 0017 "stands unchanged". ADR-0017:49-51 (a retired key makes rows unreadable "by anybody, us included") vs :52-53 (rows are re-encrypted before retirement).
- `operations/backup-restore.md:31-32` and `operations/incidents.md:98-99` escrow retired keys; `incidents.md:104-105` says retirement leaves rows unreadable.
- `operations/backup-restore.md` never mentions erasure: a restore can bring back identities erased after the dump (`incidents.md:75` calls erasure "Irreversible").
- `privacy-data-residency.md:40` encrypts `visitor_id`; ADR-0017:42-43 encrypts only `email`, `first_name`, `last_name`, `ip_address`.
- `data-model-fields.md:286, 288` types `email` as `varchar(254)` and `ip_address` as `inet`; ADR-0017 encrypts both (ciphertext is not `inet`). The table has no `email_verified` (ADR-0018:52), `email_hash` or `identity_key_id` (ADR-0017:46, 59), and no entity for the pending verification.
- `data-model-fields.md:321` says `AnalyticsEvent` is personal data "by decision (ADR-0016)"; ADR-0016 does not cover it.
- `deferred-work.md:98` lists "a superseding ADR resolving ADR-0007's internal contradiction" as blocked; ADR-0016 and ADR-0018 already replaced the period.

### D-2 Data residency (ADR-0006/0010/0019)
- ADR-0006:7 "Formal legal approval: confirmed 2026-09-07", but :13 says project ownership confirmed it and :23 says engineering saw no written legal opinion. The index (`adr/README.md:51`) says "legal approval pending". Decide which is true.
- ADR-0006:25-27 says a transfer abroad supersedes the record; ADR-0019 sends learner IPs abroad (:71-73) and only "Relates to" 0006. ADR-0019 has no legal owner or legal review line.
- ADR-0010:70-72 (a CDN that sees visitor IPs is a transfer abroad) vs ADR-0019:31 ("Our data does not leave").
- ADR-0018:103 makes a mail server mandatory and never mentions ADR-0006 (0006:43-44 lists email providers as a residency decision).
- `operations/monitoring.md:3-5` (external alert route and uptime check) sets no residency limit.
- `privacy-data-residency.md:105` softens the rule to "is intended to remain"; it also omits the ADR-0019 exception.

### D-3 The e-IFU flow (ADR-0018, the specification)
- ADR-0018:45-46: step two takes "the `verification_id` and the code, and nothing else"; `eifu-resolution-specification.md:75-76` also accepts `first_name`, `last_name`.
- `eifu-domain.md` and `api-conventions.md:9` list only `resolve`; ADR-0018 splits the lookup into `/verification` then `/resolve`.
- `eifu-domain.md:12-15` omits the `has_date_conflict` check that comes before the override (`state-machines.md:238-241`, spec steps 5-6).
- The spec's outcome table (:422-436) omits the four `EIFU_VERIFICATION_*` codes step two returns, though :133 says `code` is "always one of the outcomes below".
- `error-codes.md:159-160` (every public code is recorded) vs spec :444 ("A request rejected at validation records nothing").
- `EIFU_LANGUAGE_NOT_AVAILABLE` (`error-codes.md:178`) assumes a language parameter the spec's requests do not have.
- `EIFU_FILE_HASH_MISMATCH`: spec :518 (refuses a byte-identical replacement) vs `error-codes.md:200`, `object-storage.md:57` (bytes do not match the declared hash).
- Download name: spec :123-125 (neutral name, never the uploader's) vs `object-storage.md:44-45` (`original_filename` as `Content-Disposition`).
- `docs/design/design-system.html:314-315` shows a one-step form with no consent; `:351` reveals another catalog number (`BS-GHPV-L-050`) in an error, against spec :119-120.

### D-4 LOT data (ADR-0008, ADR-0013)
- ADR-0008:46-49 (§6) sets `has_date_conflict` and flags the row; `eifu-imports.md:92-95` writes only `CREATED` and no flag. `state-machines.md:245` agrees with the ADR.
- ADR-0013:79-81 (kit code checked at import only, writes nothing) vs `eifu-imports.md:156-157` (single-LOT form "reports a mismatch and registers the LOT").
- Spec :342 ("The trailing segment is the kit code") vs ADR-0008:52-53 (the tail *ends with* a kit code).
- `eifu-imports.md:80-90` uses five reason codes that `error-codes.md` does not register: `IMPORT_DUPLICATE_ROW`, `LOT_KIT_CODE_MISMATCH`, `IMPORT_CONFLICTING_ROWS`, `IMPORT_LOT_MISSING`, `IMPORT_SUPPLIED_DATE_INVALID` (`error-codes.md:6` forbids unregistered codes).

### D-5 Product identity (ADR-0005, ADR-0012)
- ADR-0012:39-46 (format varies within 14 products; "Each format has its own IFU") vs ADR-0005:49-50 (different IFUs in one product need a new ADR) and ADR-0012:91 ("Applicability stays product-level… with no exception"). ADR-0012 does not supersede 0005.
- Spec fixture (:547, :562) "one product `BS-GHPV`, one catalog number `BS-GHPV-L-100`"; by ADR-0012:24-30 the product is `BS-GHPV-L`.
- `deferred-work.md:86-88, 226-240` drop the explicit IVD/RUO column and the export-derived identity; ADR-0012 (still Accepted) needs that column (:108). Counts disagree: `deferred-work.md:232-237` (408, 322, 102) vs ADR-0012:56-58, 120 (96).
- `permission-matrix.md:77` lets `eifu.document.manage` create applicability periods; spec :227-230 and `state-machines.md:187` create them only at publication.
- The course–product many-to-many (`academy-domain.md:62-66`, `domain-model.md:13-14`, ADR-0012:72-80) has no table in `data-model-fields.md`.

### D-6 Video and captions (ADR-0019)
- ADR-0019:14-15, 77-78 (self-hosted `video` "stays… not deprecated") vs `learning-engine.md:17-19` and `deferred-work.md:198-207` (refused as `planned`).
- `learning-engine.md:18` ("settled on embedding on 2026-09-14") vs ADR-0019:34 (2026-09-06; the ADR is dated 2026-09-07).
- `accessibility.md:35-36` (captions required, per-locale caption upload) vs ADR-0019:83-89 (captions cannot be enforced for embeds; a localized `summary` is required, "in accessibility.md" — which does not contain it).
- `object-storage.md:11, 108` provisions a video bucket for a block type that is not built.

### D-7 Error envelope and codes (ADR-0014)
- ADR-0014:68-71 (`status`, `code`, `message`, `details`; `details` is `null` unless validation, then an array of `{field, issue}`) vs `error-codes.md:11-17, 26-34, 127` (no `status`, `details: {}`, `details.fields` object) and `details` payloads at `error-codes.md:171, 190, 226, 232, 239, 241`, `api-conventions.md:19-25`, `deferred-work.md:203`, `eifu-imports.md:66`.
- `api-conventions.md:19-25` uses `LOT_NOT_FOUND`, which is not registered (`EIFU_LOT_NOT_FOUND` is).
- `error-codes.md:69` and ADR-0014:43 say the SDS list has 38 codes. The installed `sds-logging` list is longer, and now has `RES-4500`, `VAL-4550`, `VAL-4600` for the 405/413/415 cases `error-codes.md:88-98` says have no SDS code.
- `error-codes.md:109` maps `AUTH_PROVIDER_UNAVAILABLE` to "503" (an HTTP status in the SDS column); :113 maps it to `AUTH-5500`. The code has no row in the Authentication table (:145-155).
- Near-synonyms: `USER_ALREADY_EXISTS` (:253) / `USER_EMAIL_ALREADY_EXISTS` (:303); `LOT_ALREADY_EXISTS` (:218) / `CATALOG_LOT_ALREADY_EXISTS` (:262); `ROLE_ASSIGNMENT_NOT_PERMITTED` (:257) / `ROLE_ASSIGNMENT_OUT_OF_SCOPE` (:304).
- The "Academy — learning" section (:246) holds organization, user, role and catalog codes (:250-262).
- `COURSE_NOT_ASSIGNED` (:268) has no meaning text.
- The suffix rule (:75-78) does not cover `_ALREADY_PENDING`, `_ALREADY_WITHDRAWN`, `_ALREADY_ASSIGNED`, `_ALREADY_ACTIVATED`, `_ALREADY_PRESENT`.
- `AUTH_INVALID_CREDENTIALS` is HTTP 400 (:149), but its override says "not a malformed payload" (:108).
- ADR-0014:50-51 ("roughly sixty domain codes") vs about 130 in the registry.

### D-8 Authentication (ADR-0003, ADR-0011)
- ADR-0003:40 (e-IFU flow "unauthenticated and stateless") vs ADR-0018:37-50 (a stateful two-request flow). ADR-0018 does not mention 0003.
- Sign-in endpoint: ADR-0011:20 `POST /api/v1/auth/login/` vs `operations/incidents.md:61, 64` `/api/v1/auth/csrf`, `/api/v1/auth/sign-in`.
- `authentication-authorization.md:48` cites ADR-0015 for "Express sessions in Redis with a double-submit CSRF token"; ADR-0015 does not say this.
- `eifu-domain.md:81-82` calls the second front-door panel "the Academy sign-in"; ADR-0011's one sign-in also serves the backoffice.

### D-9 Names, fields and states
- `EIFUAccessRecord` (`data-model-fields.md:280`, `domain-model.md:28`, `analytics.md:60, 120`, `eifu-domain.md:44`, `error-codes.md:159`, `object-storage.md:126`, `privacy-data-residency.md:29`) vs `EifuAccessRecord` (`data-model-fields.md:336`, `logging-observability.md:53, 96`, ADR-0017:42, ADR-0018:52).
- Applicability constraint: `documentapplicability_no_overlap_per_product` (`data-model-fields.md:212`) vs `applicability_no_overlap_per_product` (`database-migrations.md:24`, ADR-0015:92).
- Text scale: `data-model-fields.md:364` (four values `small/normal/large/larger`, lowercase against its own UPPER_SNAKE rule at :15) vs `design-system.md:250-251` (six steps, 75–150 %, `smaller`…`largest`).
- `design-system.md:256-257` says "150% is the tier WCAG's resize criterion is written around". WCAG SC 1.4.4 is written around **200 %**, so the scale still stops short. A product decision (add a 200 % step, or change the claim).
- `design-system.md:121` ("`700` for a heading") vs :184-185 (only 400, 500, 600 are loaded).
- Admin role: "Platform/System Administrator" (`authentication-authorization.md:20`), "System/Platform Administrator" (`eifu-domain.md:71`), "Platform Administrator" (`permission-matrix.md`). `notifications.md:38, 50` name roles that do not exist ("publisher role holders", "IFU manager role holders").
- Event names: prefixed in `state-machines.md` (`academy.course_version.approved`, …), unprefixed in `notifications.md:38, 48, 50` and `state-machines.md:260` (`access_request.submitted`). `notifications.md:135-137` says nothing raises the `course_version.*`/`document_version.*` events yet; `state-machines.md` shows them as current side effects.
- Field casing: `schemaVersion` (`learning-engine.md:96, 266-271`) vs `schema_version` (`state-machines.md:139`, `error-codes.md:239`); `contentBlock` vs `content_block`; `owningOrganization` next to `parent_organization_id` (`organization-model.md:29, 32`).
- `verification_id` means two things: the e-IFU code verification (spec :65, :73) and the certificate's public id (`state-machines.md:283`).
- `learning-engine.md:96` (`pcr_curve` schema version 2) vs the example at :270-271 (version 1).
- `academy-domain.md:9` lifecycle has no `DISCARDED` (`state-machines.md:26-28` has it). `data-model-fields.md` `CourseVersion` has no `in_progress_policy` / grace-period fields that `state-machines.md:67, 81` need.
- `domain-model.md:42` ("Enrollment / LearningProgress as needed") vs `data-model-fields.md:591` (progress is computed, never stored). `domain-model.md` lacks about ten entities that `data-model-fields.md` defines, though :65 claims to cover "every entity above".
- `state-machines.md:316-323` (ImportBatch starts `PENDING` in the diagram, "created `PROCESSING`" in the text); :303 vs :261 on what creates an Enrollment; :10 uses `COURSE_INVALID_STATE_TRANSITION` for e-IFU entities too.
- `data-model-fields.md`: `created_at`/`updated_at` on every model (:16) vs `AuditEvent` with no `updated_at` (:718); `uuid` FKs (:290-291, :679) against the `BigAutoField` rule (:21-25); `correlation_id` is `uuid` (:297, :713) and `varchar(64)` (:339); FK named `user_id`/`assignment_id` against the naming rule (:13); `SET_NULL`/`SET NULL`, `RESTRICT`/`PROTECT`.

### D-10 Permissions
- `permission-matrix.md:43, 45, 79` describe `academy.course.approve`, `academy.course.withdraw` and `eifu.document.withdraw` more narrowly than `state-machines.md:55, 57, 189` use them.
- `deferred-work.md:213` ("No registered permission is without an endpoint any more") vs `permission-matrix.md:113` (`audit.event.view`: "No endpoint checks this yet").
- `permission-matrix.md:30` requires a singular resource; `organization.users.view/manage` (:103-104) is plural.
- `analytics.md:54-60` leaves out `analytics.event.view_raw`.

### D-11 Process and tooling
- `ai-development-workflow.md:11-13` (implement, then add tests) vs `AGENTS.md:46-63` and `qa-engineer.md` (acceptance tests first). The second came from the other application; decide which one this project uses.
- `testing.md:9` ("one runner across the repository") vs `local-development.md:75` (pytest for scripts).
- `local-development.md:61-64` ("there is no admin account to create") vs `operations/deploy.md:74-77` (bootstrap creates the first admin).
- `operations/monitoring.md:53` ("JSON to stdout") vs ADR-0014:92-94 (six-field record with a logfmt tail); monitoring omits `/api/health/live` and `/api/admin/logs` (ADR-0014:21-23).
- `deferred-work.md:218` attributes the operator endpoints to `sds-auth`; `claude-tooling.md:65` and ADR-0014:21 to `sds-api-design`.
- Non-drag alternative: "where practical" (`training-studio.md:26`), "Prefer" (`frontend-react.md:11`), required (`learning-engine.md:103-106, 238-240`).
- `frontend-react.md:16-25` omits `analytics` and `administration`, which `architecture.md:48-49` lists.
- 3D formats: `threejs-simulations.md:27` (`.glb`/`.gltf`) vs `object-storage.md:55` (`.glb` only).
- `interactive-content.md:29` tracks "errors"; `learning-engine.md:284-291` has no such field.

## E. Broken references

| Reference | Cited at | Status |
|---|---|---|
| `backend/`, `frontend/`, `shared/`, `infra/`, `scripts/`, `.github/`, `Makefile` and every `make` target | ADR-0002, 0010, 0014, 0015; `repository-structure.md`, `local-development.md`, `testing.md`, `git-workflow.md:53`, `design-system.md`, `definition-of-done.md:21`, `claude-tooling.md`, `deferred-work.md`, operations runbooks | Absent (see A-02). |
| `RUNNING.md`, `.env.example` | `local-development.md:15, 24, 136`; ADR-0016:39 | Absent. |
| `scripts/*.py`, `scripts/README.md` | `local-development.md:105-115`, `claude-tooling.md:115-123`, `database-migrations.md:28`, `design-system.md:60, 126, 130`, `eifu-imports.md:48`, `localization.md:43`, `state-machines.md:337` | Absent. |
| `infra/docker/docker-compose.production.yml`, `infra/ci/smoke-production.sh`, `infra/backup/backup.sh`, `infra/storage/provision.sh`, `infra/nginx/security-headers.conf`, `./start.sh` | `operations/*`, `deferred-work.md:260` | Absent. |
| `backend-django.md` | ADR-0015:117 | Renamed to `backend-nestjs.md`. |
| `SKILL.md` (fixed platform decisions) | `adr/README.md:9` | Absent (A-18). |
| `deferred-work.md` §1.2 | `permission-matrix.md:113` | `deferred-work.md` has §1.1 and §1.4 only; no §1.2 or §1.3. Target unknown. |
| `.claude/skills/bioeksen-portal-engineering/`, `.claude/commands/`, `migration-safety-reviewer` | `claude-tooling.md:16, 18, 105` | Absent. |
| `.agents/skills/*` | `AGENTS.md`, all `.claude/agents/*.md` | Absent. |
| Code files (`global-setup.ts`, `App.test.tsx`, `domain-codes.ts`, `permissions.ts`, `password-policy.ts`, `block-registry.ts`, `log-record.ts`, `notification-registry.ts`, `operator.guard.ts`, `tokens.css`, `components.css`, `backoffice.css`, `curve-plot.css`, `pages.ts`, `pageGates.ts`, `lib/amplification.ts`, `test/identity-encryption.spec.ts`, `lot_number_vectors.json`) | `testing.md`, `error-codes.md`, `learning-engine.md`, `logging-observability.md`, `notifications.md`, `deferred-work.md`, `design-system.md`, `claude-tooling.md`, ADR-0015, 0017 | Absent. |
| `/templates/lot-import-template.xlsx` | `eifu-imports.md:47` | Absent. |
| `BKSNproducts.xlsx` | ADR-0012:5 | Not in the repo. |
| Reason-bearing actions "`audit-traceability.md` marks" | `data-model-fields.md:716` | That file marks none. |
| `summary` rule "in accessibility.md" | ADR-0019:86-88 | Not in `accessibility.md`. |
| `EIFU_IDENTITY_LOOKUP_PEPPER`, `TRUSTED_PROXY_COUNT`, `POST /api/v1/privacy/access-records/:id/identity` | `operations/*`, ADR-0017:54 | Not defined in any engineering doc. |

## F. ADR process and ADR content

These are **not fixed**: `adr/README.md:39-40` says an accepted ADR is never
edited, only superseded.

- **Edited after acceptance:** ADR-0006 (dated 2026-08-22, holds 2026-09-07 text), ADR-0007 (decision dated 2026-08-23; :10-11 claims edits while `Proposed` but records no dates), ADR-0008 (cites ADR-0013 of 2026-08-26 at :58, :64; so 0013's "Amends" note at :9-15 describes a gap that 0008 no longer has).
- **Process gap:** the template has a "Superseded by" field (`0000-template.md:9`), which needs an edit of the old ADR, against README:39-40. Decide how back-links are added.
- **Missing back-links:** 0007 → 0016, 0016 → 0017 and 0018, 0008 → 0013, 0006 → 0019, and 0001/0003/0004 → 0015 (ADR-0015:8 says "Superseded by: none").
- **Relations not in the template:** "Amends" (0013:9), "Extends" (0017:5), "Relates to" (0019:5).
- **Missing template fields:** Technical owner / Business owner / Deciders / Supersedes are missing in 0001–0013 and 0016–0019 in various combinations; only 0014 and 0015 are complete.
- **"Accepted for implementation" without an Approval provenance section** (README:30-32 requires one): 0007, 0008, 0016, 0017, 0018, 0019. ADR-0016:5 says 0007 carries the same status; the index showed plain "Accepted" (fixed, E-02).
- **ADR-0012, 0013** are plain "Accepted" with product management as business owner and no recorded sign-off from them.
- **ADR-0013:43-44, 73-75 — logic error.** The rule is `lot_number.endswith(expected)`, and :73-75 says trailing batch digits are ignored ("`KKEV1V49` alongside `KKEV1V`"). `"…KKEV1V49".endswith("KKEV1V")` is false. The suffix match does not ignore trailing digits.
- **ADR-0012:94** "111 of 553 rows" vs 573 catalog numbers at :12, :32, :115. **:56 vs :120** "96 catalog numbers" vs "96 products".
- **ADR-0014:108** ("427 passing tests survive untouched") vs ADR-0015:106 (same day: the test suite is not carried over).
- **ADR-0015 relationship table (:130-142)** omits 0006 and 0011; says 0010 is "untouched" though 0010 relies on the Python checker and `make check`.
- **ADR-0019** headings differ from the template ("Alternatives rejected"; no Positive/Negative/Follow-up). ADR-0011:53 uses "Follow-up available, not required".
- **ADR-0014:14 vs :128** — plugin named `bioeksen-sds@bioeksen-skills` and `bioeksen-ai-skills` (the marketplace and its repository; say which).

## G. Errors fixed

Rule: fixed only when the docs themselves give one right answer and no open
decision is involved. Accepted ADR bodies, `AGENTS.md`, `README.md`, `.claude/*`
and `app/*` were not changed.

| ID | File | Was | Now | Source of truth |
|---|---|---|---|---|
| E-01 | `adr/README.md:10` | "major upgrade of Python, Django, PostgreSQL or React" | "Node, NestJS, Prisma, PostgreSQL or React" | `tech-stack-versions.md:40`, ADR-0015 |
| E-02 | `adr/README.md` index | 0007 "Accepted —…"; 0016 "Accepted —…"; 0009 title without "stored" | 0007 and 0016 "Accepted for implementation" (0016 adds "legal review pending"); 0009 title as in the file | The ADR files' own Status and title lines |
| E-03 | `data-model-fields.md:376` | `organization_type` enum `INTERNAL` / `CUSTOMER` / `DISTRIBUTOR` | adds `DEPARTMENT` | `organization-model.md:6, 32`; same file :463; `permission-matrix.md:207` |
| E-04 | `data-model-fields.md:37` | "PostgreSQL 15+, which is our baseline" | "PostgreSQL 15+; the baseline is 16" | `tech-stack-versions.md:16` |
| E-05 | `data-model-fields.md` | `LessonCompletion` row stranded after prose; blank line split the Assignment table; `---` under a text line made it an H2 | Row moved into the table; blank line removed; blank line added before `---` | Markdown rendering |
| E-06 | `deferred-work.md:47` | "Both are closed. Neither was visible" (after three entries) | "All three are closed. None was visible" | Same section, :27-45 |
| E-07 | `eifu-domain.md:5-17, 55` | Notice accepted in step 1 and again in step 2; override to "a different approved DocumentVersion" | One acknowledgement in step 1 (ADR-0018), steps renumbered; target "`PUBLISHED` or `SUPERSEDED` … of the same product" | ADR-0018; `state-machines.md:231` (DocumentVersion has no APPROVED state) |
| E-08 | `eifu-resolution-specification.md:137, 168` | "Five tables"; `ON lots (lot_number)` | "Seven tables"; `ON lots_lot (lot_number)` | The seven table sections at :140-264; the table name at :152 |
| E-09 | `learning-engine.md:118` | `GET /authoring/block-types` | `GET /api/v1/authoring/block-types` | Same file :109; `api-conventions.md:3` |
| E-10 | `state-machines.md:248` | `### CourseAccessRequest` (nested under the e-IFU section) | `## CourseAccessRequest` | It is an Academy entity |
| E-11 | `error-codes.md` | Duplicate rows: `EIFU_DOCUMENT_ALREADY_EXISTS`, `EIFU_REVISION_ALREADY_EXISTS`, `EIFU_VERSION_NOT_DRAFT` (twice in e-IFU administration); `CATALOG_NUMBER_ALREADY_EXISTS` (Catalog and Academy — learning); `ORGANIZATION_RELATIONSHIP_INVALID` (Academy — learning and Organizations) | Each code once, in its own section, with the texts merged | `error-codes.md:6` (one registry entry per code) |
| E-12 | `privacy-data-residency.md:45` | "legal review pending (`CLAUDE.md`)" | "(ADR-0018, *Status*)" | ADR-0018 Status line; `CLAUDE.md` does not say it |
| E-13 | `project-overview.md:255`, `analytics.md:107-108`, `privacy-data-residency.md:80` | Retention "indefinite"; "No automatic purge…"; "this open decision" | Ten years, then anonymised (ADR-0018); erased earlier on request (ADR-0016); "this decision" | ADR-0018; `privacy-data-residency.md:31-40`; `data-model-fields.md:300-301` |

## H. Errors found but not fixed

| Item | Why not fixed |
|---|---|
| A-09 `@heroui/styles` not installed | Depends on the HeroUI decision (A-06). Outside `docs/`. |
| Errors inside accepted ADRs (section F, including ADR-0013's suffix logic and ADR-0012's counts, ADR-0015's `backend-django.md`) | `adr/README.md:39-40`: supersede, do not edit. |
| `permission-matrix.md:113` → `deferred-work.md` §1.2 | The intended section is unknown; §1.2 and §1.3 do not exist. |
| `design-system.md:256-257` WCAG "150 %" | WCAG SC 1.4.4 is 200 %. A correct sentence changes the conclusion (the scale stops short), so it needs a product decision. |
| `design-system.md:121` weight 700 | Load 700, or change the rule to 600. |
| `authentication-authorization.md:48` citation of ADR-0015 | The Express-session / double-submit detail is in no ADR. Needs an ADR or a source. |
| `error-codes.md` near-synonyms, misfiled section, empty `COURSE_NOT_ASSIGNED`, `AUTH_PROVIDER_UNAVAILABLE` | Choosing the surviving code or its meaning is a contract decision. |
| `EIFUAccessRecord` vs `EifuAccessRecord`, `schemaVersion` vs `schema_version`, constraint name, text-scale enum, event names | A naming choice; the ADRs use one spelling and cannot be edited. |
| `learning-engine.md:270-271` example at `schemaVersion: 1` | Raising the number without the version-2 shape would make a wrong example. |
| `local-development.md:105-109` `python3` vs uv | The whole file depends on A-01/A-02. |
| `git-workflow.md` vs sds-commit | Types and scopes need a choice (A-13). |
