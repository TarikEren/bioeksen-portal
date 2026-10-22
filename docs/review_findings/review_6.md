# Review 6 — Stage B3: phase review in crisis mode

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| 6 | 2026-10-22 | The phase review of B3 (DEC-136, `crisis_mode.md` §4 step 5): the commits `0a23f93..8f4a601` (the contract, the mock skeleton, the screens, the backend), and R-065 that `5c87336` claims to fix. One `code-reviewer` agent; the main session checked R-084 before it recorded it. R-093 and R-094 come from the walk of the exit flow on the demo (§5) | `8f4a601` | Approve with follow-ups: no Critical or Major finding; nothing blocks B4 |

The log of every review, and the status of every finding: [README](README.md).

## Summary

The exit flow of B3 works on the demo, as the IFU Manager:
- the document `KTL-0042` of `BS-GHPV-L`;
- three versions, each with a PDF, published from 2024-01-01, 2025-01-01 and 2026-01-01, which gives the periods of IFU-30 (01 and 02 `SUPERSEDED`, 03 open);
- the refusals of IFU-30.AC3 and AC8 at their fields;
- the replacement of the file of 02 with a reason (both hashes and the reason in the history; the old row inactive);
- the withdrawal of 03 without reopen (its period withdrawn), and of a later 04 with reopen (02 `PUBLISHED` again, its period open: IFU-31.AC2);
- an override from a LOT to the `SUPERSEDED` 01 (the choice lists only `PUBLISHED` and `SUPERSEDED` versions).

Each change has its `platform_audit_record` row with the actor and the request
id. A direct SQL change of the stem of the product is refused by
`product_identity_is_settled` (DEC-096). Screenshots:
[`docs/plans/b3-exit/`](../plans/b3-exit/).

The reviewer checked: the publication in the order of IFU-30 rule 3 in one
transaction, with the supersede move and AC3 to AC6 and AC8; two publications
at once end in the exclusion constraint (`23P01` → 409 `RES-4301`); withdrawal
(IFU-31, DEC-064); replacement (IFU-32, DEC-065, DEC-124); overrides (IFU-40);
the audit rows in the transaction; the triggers and the constraint with the
names of the spec; the lock of `updateProduct` against a document insert; the
PDF check from the bytes, the 20 MiB limit counted as it arrives, the hash
check before the store, the key and `If-None-Match` of the platform, the signed
URL of 300 s and the cleaned attachment name; the permissions; the module
boundary; no type escape; DEC-019.

Checks at `8f4a601`: `pnpm run typecheck` and the lint of the changed files
pass; no `MOCK:` remains; `globals.css` is unchanged. Not verified: that the
ORM puts the row lock after the sort; the behavior of the migration runner for
R-087.

**Verdict: Approve with follow-ups.** No Critical or Major finding. Nothing
blocks B4: a live period always belongs to a `PUBLISHED` or `SUPERSEDED`
version, the exclusion constraint gives a date one period or none, and an
override names the version that the lookup needs. Each finding waits for the
call of the owner (`crisis_mode.md` §4 step 6).

## Findings

Line numbers are as of `8f4a601`.

### R-084 — publishVersion locks the version before the document, against its own stated order, so a withdrawal at the same time can deadlock

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (phase reviewer; confirmed in the code by the main session; the timing was not run)
- **Where:** `src/modules/eifu/services/publication-service.ts:80` (version, `no-key-update`), then `:90` (document); the header `:9-12` and the comment `:162` state the other order; `withdrawVersion` locks the document (`:167`), the periods (`:171`), then the version (`:172`).
- **Problem:** a publication that holds the version and an API withdrawal of the same version that holds the document wait for each other; PostgreSQL ends one with `40P01`, which gives 500 `DB-5002` where a 409 was due.
- **Fix:** read the version without a lock, lock the document, then lock the version, as `withdrawVersion` does; or correct the comments.

### R-085 — The e-IFU file service builds the storage key by hand when the object exists

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (phase reviewer; confirmed)
- **Where:** `src/modules/eifu/services/file-service.ts:113-123` (`storeBytes`, `:119`).
- **Problem:** the key form of DEC-032 is in two places, and the copy skips the checks of the platform; it drifts if the platform key changes.
- **Fix:** the platform returns the key when the object exists (for example `{ key, existed: true }`), or exports one key builder.

### R-086 — The document list loads every document, pages in memory, and searches with Turkish lower-casing

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (phase reviewer; confirmed with node)
- **Where:** `src/modules/eifu/services/document-service.ts:68-70`, `:82`, `:88-91`; `repositories/document-repository.ts:97-101`; `src/app/backoffice/catalog/lots/[id]/_lib/version-choices.ts:33-34` (one read for each document).
- **Problem:** the query `ifu` misses the title `IFU Kit` (`"IFU Kit".toLocaleLowerCase("tr")` is `ıfu kit`), the result set has no limit, and the LOT page reads each document again (`sds-database` §6). Same cause as R-066.
- **Fix:** search and page in SQL with a fold that does not depend on the locale, and read the versions for the LOT page in one query.

### R-087 — The migration refuses to run where btree_gist exists already

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (phase reviewer; plausible: depends on how IT prepares the database, DEC-135)
- **Where:** `src/prisma/migrations/app/20261022T1702_eifu_documents/migration.ts:24-34` (the precheck `SELECT NOT (EXISTS …)`), used at `:474-476`.
- **Problem:** the Prisma 8 runner stops when the precheck fails, so a database where a DBA installed the extension refuses the migration, although `CREATE EXTENSION IF NOT EXISTS` would succeed.
- **Fix:** no "not there" precheck for the extension, or the `createExtension` operation of the migration API.

### R-088 — The e-IFU write transactions take a second pool connection for the catalog reads while they hold their locks

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (phase reviewer; plausible: needs about 10 writes at once)
- **Where:** `eifu-views.ts:94-120` → `catalog-reads.ts:66`, `:81`, `:97`, `:131` (`readExecutor()`), called inside `runTransaction` from `document-service.ts:153`, `:227`, `:270`, `publication-service.ts:141`, `:216`, `override-service.ts:130`, `:168`; pool size 10 (`db/index.ts:119`).
- **Problem:** 10 open transactions that each wait for an 11th connection exhaust the pool and time out with `DB-5501` while they hold the document and period locks.
- **Fix:** read the product and LOT references before the transaction, or build the answer after the commit.

### R-089 — The version page shows the words of the period in IBM Plex Mono

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (phase reviewer; confirmed)
- **Where:** `src/app/backoffice/documents/[id]/versions/[versionId]/page.tsx:122` (`font-mono` around the whole `periodText(...)`, for example "1 Jan 2026 – open-ended").
- **Problem:** DEC-016: no text other than a business identifier or a date is in IBM Plex Mono.
- **Fix:** mono only on the dates.

### R-090 — The migration creates an extra index on applicability.product_id

- **Status:** **Open** · **Severity:** Note · **Found:** review 6 (phase reviewer)
- **Where:** `migration.ts:305-310` (`eifu_applicability_product_id_idx_22a2b7d2`); `applicability_lookup_idx` and the gist index of the exclusion constraint both start with `product_id`.
- **Fix:** drop it from the contract, if Prisma does not need it for the relation.

### R-091 — The upload and replacement forms leave out a file of 0 bytes, so the person sees "required" and not "has no bytes"

- **Status:** **Open** · **Severity:** Note · **Found:** review 6 (phase reviewer)
- **Where:** `upload-file-form.tsx:56-59`, `replace-file-form.tsx:54-56` (`file.size > 0`). The API answers IFU-20.AC8 correctly.
- **Fix:** leave the field out only when no file was chosen (`file.name === ""`).

### R-092 — Two commit trailers do not follow the conventions

- **Status:** **Won't fix** (the history of the branch stays, as for R-074) · **Severity:** Note · **Found:** review 6 (phase reviewer)
- **Where:** `8f4a601` is a `refactor` with `Test-Exempt: acceptance` (only `feat` and `fix` carry it); `5c87336` has no `Refs: R-065` (`sds-reviewing` §15, a SHOULD).
- **Fix:** none.

### R-093 — The server accepts a language code that is well formed but not registered, such as trtr

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (main session, walk of the exit flow; confirmed in the demo database)
- **Where:** `src/modules/eifu/domain/language-code.ts` (`isLanguageCode` checks the syntax only); the upload form `upload-file-form.tsx:96` (`defaultValue="tr"`).
- **Problem:** the field holds `tr`, a person who types `tr` sends `trtr`, and the server stores five files with the language `trtr` (`documents/1/1/trtr/…`). DEC-069 and IFU-20.AC6 ask for a BCP 47 tag; RFC 5646 reserves a primary subtag of 4 letters, and `trtr` and `english` are not registered. A lookup in B4 then shows a file of a language that does not exist.
- **Fix:** check the primary language subtag against the registered codes (ISO 639 via `Intl.DisplayNames` or a bundled list), and keep the field empty with `tr` as a placeholder, or select its text on focus.

### R-094 — The version headings of the document page read "Revision03"

- **Status:** **Open** · **Severity:** Minor · **Found:** review 6 (main session, walk of the exit flow)
- **Where:** `src/app/backoffice/documents/[id]/_components/version-timeline.tsx` (the heading). Screenshot: `docs/plans/b3-exit/01-three-versions-published.jpg`.
- **Problem:** the label and the revision have no space between them.
- **Fix:** a space, or the label in its own element.

## Earlier findings

- **R-065:** fixed in `5c87336`. The import commit reads its catalog numbers by value `FOR SHARE`, sorted by id, then its products (and the product of a one-product import) `FOR SHARE`, in the order of `registerLot`. `updateProduct` (`FOR UPDATE`) and `updateCatalogNumber` (`FOR UPDATE`) now wait for it, and no lock cycle exists.
- **R-066:** the same cause appears in new code; see R-086.
- **R-077:** the comment of the `eifu_documents` migration (`migration.ts:17-19`) makes the same claim; no test covers its raw objects yet.
- **R-079:** the B3 pages repeat it: `break-all` on identifiers in `documents/page.tsx:86`, `:100`; `documents/[id]/page.tsx:81`; `version-timeline.tsx:68`; `catalog/lots/[id]/page.tsx:80`, `:117`, `:126`, `:174`; `lot-overrides/page.tsx:93`, `:94`, `:99`; `product-documents-section.tsx:34`.
