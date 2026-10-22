# Review 5 — Stage B2: phase review in crisis mode

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| 5 | 2026-10-22 | The phase review of B2 (DEC-136, `crisis_mode.md` §4 step 5): the commits `1902f5d..4afd75f` (the contract, the mock skeleton, the screens, the backend). One `code-reviewer` agent; the main session checked the Major claims before it recorded them. R-079 to R-083 come from the walk of the exit flow on the demo (§5) | `4afd75f` | Approve with follow-ups: R-064 and R-065 are Major; no finding blocks B3 |

The log of every review, and the status of every finding: [README](README.md).

## Summary

The exit flow of B2 works on the demo, as the IFU Manager: a product with two
catalog numbers, a LOT import from pasted text with its row report (3 new, 1
review, 1 invalid), and a LOT registered with a supplied date that differs,
then corrected with a reason (`MANUAL_CORRECTION`, no conflict). Each change has
its `platform_audit_record` row with the actor and the request id. The pages
are in English for a user whose preferred language is English, also with a
Turkish language cookie (FND-08.AC5). Screenshots: [`docs/plans/b2-exit/`](../plans/b2-exit/).

The reviewer checked: transport cleanup and date reading against each vector
of CAT-30; the kit-code rule (CAT-50.AC1 to AC5, DEC-050); the outcome and
reason of each import row; the commit that plans again inside its transaction
and records `FAILED` after a rollback; the raw cells; the locks of a single
registration; the audit rows in the transaction; the permissions on each route,
action and page; the body limit counted as it arrives; the migration (only
additive, the named constraints, the 10 triggers); `globals.css` unchanged.

Checks at `4afd75f`: `pnpm run typecheck` and the lint of the changed paths
pass; the unit and component tiers give 299 passed and 4 failed (only
FND-09.AC2). Not verified: the memory limit at which R-064 stops the process,
the dependency audit of DEC-134 for the 79 new packages, the UI at phone width
and the new contrast pairs.

**Verdict: Approve with follow-ups.** R-064 and R-065 are Major. No finding
blocks B3. Under `crisis_mode.md` §4 step 6, each finding stays open until the
owner calls for its fix. When B3 adds the document check to the stem lock of
`updateProduct`, R-065 is in the same check.

## Findings

Line numbers are as of `4afd75f`.

### R-064 — An XLSX file of 5 MiB can make the server unpack gigabytes and parse every row before the 5,000-row limit

- **Status:** **Open** · **Severity:** Major · **Found:** review 5 (phase reviewer; the code path confirmed by the main session; the memory exhaustion is plausible)
- **Where:** `src/modules/catalog/domain/xlsx-sheet.ts:35-63` (`isUnpackedSizeBounded`) and its comment at `:31-34`; `:112` (`workbook.xlsx.load`), `:121` (`sheet.eachRow`); `src/modules/catalog/domain/import-reader.ts:242`, `:280-281`.
- **Problem:** the pre-check adds the sizes that the ZIP directory states, and the uploader writes those. `exceljs` 4.4.0 inflates each entry in full, and JSZip compares the real size with the stated size only at the end. A 5 MiB file whose `sheet1.xml` deflates about 1000:1 and states 1 kB passes the 413 check and the pre-check, and then about 5 GB is held in memory. A file with honest sizes can still unpack 64 MiB of sheet XML, and every row is built before the count of 5,000 (DEC-051). The comment "exceljs checks the stated size … while it unpacks" is wrong.
- **Fix:** inflate each entry with a hard limit on the output bytes (`zlib.inflateRawSync(…, { maxOutputLength })` or a streaming unzip that counts), read the sheet with the streaming `WorkbookReader`, stop at row 5,002, and correct the comment.

### R-065 — An import commit locks no product row, so the stem and status lock and the product scope can race

- **Status:** **Open** · **Severity:** Major · **Found:** review 5 (phase reviewer; confirmed in the code by the main session; needs two requests at the same time)
- **Where:** `src/modules/catalog/services/lot-import-service.ts:109-113` (`findCatalogNumbersByValues`, `findProductsByIds` with no lock); compare `product-service.ts:216-218`, `:246-253` and `lot-service.ts:102-109`. `runTransaction` is READ COMMITTED.
- **Problem:** `updateProduct` locks the product and counts 0 LOTs while a commit writes LOTs under it; the stem or the status of a product with LOTs then changes (CAT-10 rule 3, AC4). In the other order, a move of a catalog number lets a commit for product A write a LOT under product B (CAT-60 rule 5), with the kit code of the old product. The comment at `product-service.ts:216` holds only for `registerLot`.
- **Fix:** in the commit transaction, before the plan, read the catalog numbers and the products of the rows `FOR SHARE`, sorted by id, as `registerLot` does.

### R-066 — Product search lower-cases with the Turkish locale, so a query with "i" misses Latin text

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed with node)
- **Where:** `src/modules/catalog/services/product-service.ts:93`, `:107` (`matchesText`, `listProducts`).
- **Problem:** the query `sti` does not find the stem `BS-STI-L` (`"BS-STI-L".toLocaleLowerCase("tr")` is `bs-stı-l`), and `infections` does not find an English name with "Infections" (CAT-10 *Screens*).
- **Fix:** one normalization that does not depend on the locale, or the Turkish form only on `name.tr`; or search in SQL.

### R-067 — The registration audit row says that a kit-code mismatch was confirmed when no mismatch existed

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed)
- **Where:** `src/modules/catalog/services/lot-service.ts:169` (`kitCodeMismatchConfirmed: input.confirmKitCodeMismatch === true`).
- **Problem:** a call with `confirmKitCodeMismatch: true` for a LOT that matches gets an audit row that reports a confirmed mismatch (DEC-050, DEC-014).
- **Fix:** record `mismatch && confirm`, and optionally the expected kit code.

### R-068 — A commit with a productId that names no product tries to record a FAILED import, which the foreign key refuses, and logs an ERROR

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed in the code and the schema)
- **Where:** `lot-import-service.ts:162` (`VAL-4006` inside the transaction), `:240`, `:346` (`recordStop` → `insertFailedImport`); `catalog_lot_import_product_fk`.
- **Problem:** each such request writes an ERROR record with a database code and then answers 400 (CAT-60 rule 8 against AC10; `sds-logging`: a 400 is not an ERROR).
- **Fix:** check `productId` before the transaction.

### R-069 — The import reader reports only the first group of faults

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed)
- **Where:** `import-reader.ts:274-282`.
- **Problem:** a header with `Katalog No` and no data row answers only "`lotNumber`: has no column in the input"; "no data rows" is lost (CAT-60 rule 12: a `details` entry for each fault).
- **Fix:** collect every fault, then throw once.

### R-070 — The import server actions do not check that the argument is FormData

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed)
- **Where:** `src/app/_actions/catalog.ts:169`, `:178` (`formDataToObject(form)`).
- **Problem:** a crafted call with a string gives a `TypeError`, then 500 `SYS-5000` and an ERROR record, where the answer is a 400 (`sds-nextjs-backend`: validate each boundary).
- **Fix:** `if (!(form instanceof FormData))` → `VAL-4000`.

### R-071 — The confirmation of DEC-050 and the issue texts depend on English details phrases that are copied by hand

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed; the phrases match today)
- **Where:** `src/app/backoffice/catalog/products/[id]/_components/register-lot-form.tsx:38` against `lot-service.ts:127`; the `fieldIssues` keys of `src/lib/i18n/dictionaries/{en,tr}.ts` against the literals of `import-reader.ts` and `lot-service.ts`.
- **Problem:** if a server phrase changes, the confirmation step goes away without an error, and a person cannot register a LOT whose mismatch they want to confirm.
- **Fix:** one `as const` set of the issue phrases in `src/lib/schemas/catalog.ts`, used by the services, the form and the dictionary keys.

### R-072 — The comment of the vectors file says that the special characters are escapes, but the file holds the raw characters

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed with `od -c`)
- **Where:** `tests/fixtures/cat-30-vectors.json:2`, `:16`, `:18`.
- **Problem:** a reader cannot see U+00A0 and the BOM (CAT-30 *Data*).
- **Fix:** write them as JSON escapes (` `, `﻿`).

### R-073 — The two day-first date forms accept mixed separators

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (phase reviewer; confirmed)
- **Where:** `src/modules/catalog/domain/supplied-date.ts:17` (`/^(\d{2})[./](\d{2})[./](\d{4})$/`).
- **Problem:** `09.03/2026` is read as 9 March 2026; DEC-053 lists only three forms.
- **Fix:** `/^(\d{2})([./])(\d{2})\2(\d{4})$/`.

### R-074 — Commit 0adcae0 alone does not type check

- **Status:** **Won't fix** (the history of the branch stays, as for R-045 and R-051) · **Severity:** Note · **Found:** review 5 (phase reviewer; confirmed)
- **Where:** `0adcae0`: `lot-import-service.ts:49` imports `./lot-store`, which the commit deletes.
- **Problem:** a bisect breaks at this commit.
- **Fix:** none.

### R-075 — exceljs adds 79 packages, some of them deprecated, and the dependency audit has not run

- **Status:** **Open** · **Severity:** Note · **Found:** review 5 (phase reviewer)
- **Where:** `package.json`, `pnpm-lock.yaml` (`inflight@1.0.6`, `glob@7.2.3`, `rimraf@2.7.1`, `fstream@1.0.12`, `unzipper@0.10.14`).
- **Problem:** DEC-134 fails the pipeline on a high or critical advisory; nobody ran the check for these packages.
- **Fix:** run the dependency check of FND-07 and record the result.

### R-076 — The check of failure_code lets a FAILED import have no code

- **Status:** **Open** · **Severity:** Note · **Found:** review 5 (phase reviewer)
- **Where:** `src/prisma/contract.prisma:277` (`catalog_lot_import_failure_code_only_when_failed`).
- **Problem:** CAT-60.AC14 wants a code on each `FAILED` import; the code always sets one, but the database does not guard it.
- **Fix:** add `status <> 'FAILED' OR failure_code IS NOT NULL` in a later migration.

### R-077 — The migration comment says that an integration test proves each trigger, and none does yet

- **Status:** **Open** · **Severity:** Note · **Found:** review 5 (phase reviewer)
- **Where:** the `catalog` migration, `migration.ts:21`.
- **Problem:** no test covers the 10 catalog triggers (DEC-005; new tests wait for the test phase, DEC-136).
- **Fix:** the test phase adds the test.

### R-078 — kit-code.ts takes a substring of the part of a LOT number after its date

- **Status:** **Open** · **Severity:** Note · **Found:** review 5 (phase reviewer)
- **Where:** `src/modules/catalog/domain/kit-code.ts:48`; the exception is written in the header of `lot-number.ts`.
- **Problem:** CAT-30 rule 3 says that no other code takes a substring of a LOT number.
- **Fix:** test the suffix with the pattern `expected + "\d*$"`.

### R-079 — At 1024 px, LOT numbers and catalog numbers break inside the value

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (main session, walk of the exit flow)
- **Where:** the LOT table of `src/app/backoffice/catalog/products/[id]/`, the preview and the report tables of the import. Screenshot: `docs/plans/b2-exit/05-lots-after-correction.jpg`.
- **Problem:** `B2603121224GH` / `PVV` and `BS-GHPV-L-2` / `5` show on two lines, so a person can misread an identifier.
- **Fix:** keep each identifier on one line (no break inside the value), and let the other columns wrap.

### R-080 — The import tables show the supplied date as typed, or "None", in the column "Manufacturing date"

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (main session, walk of the exit flow)
- **Where:** the preview of `/backoffice/catalog/lot-imports/new` and the rows of `/backoffice/catalog/lot-imports/[id]`. Screenshots: `docs/plans/b2-exit/02-import-preview.jpg`, `03-import-report.jpg`.
- **Problem:** the cells show `2026-03-11`, `10.03.2026` and "None" side by side, not the form of DEC-133, and "None" where the LOT gets its encoded date.
- **Fix:** show the date that the plan reads (encoded or supplied) in the form of DEC-133, and keep the raw cell for the raw-cells view.

### R-081 — The import report shows "All products" in the face of the identifiers

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (main session, walk of the exit flow)
- **Where:** `/backoffice/catalog/lot-imports/[id]`, the field *Product*. Screenshot: `docs/plans/b2-exit/03-import-report.jpg`.
- **Problem:** DEC-016: no text other than a business identifier is in IBM Plex Mono.
- **Fix:** IBM Plex Sans for "All products"; IBM Plex Mono only for a stem.

### R-082 — A group heading of the preview says "1 rows"

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (main session, walk of the exit flow)
- **Where:** the preview of `/backoffice/catalog/lot-imports/new` ("Rows with no known product, 1 rows").
- **Problem:** the text does not agree with the count.
- **Fix:** a singular and a plural form in the dictionaries.

### R-083 — The message "registered with a date conflict" stays after the date is corrected

- **Status:** **Open** · **Severity:** Minor · **Found:** review 5 (main session, walk of the exit flow)
- **Where:** the single-LOT form and the correction drawer of `/backoffice/catalog/products/[id]`.
- **Problem:** after the correction, the page still says that the LOT gets no instructions until its date is corrected.
- **Fix:** clear the message of the form when a correction succeeds, or show the result of the correction in its place.

## Earlier findings

- R-056: the B2 actions follow the order session, permission, validation.
- R-046 and R-057: B2 repeats both patterns; they stay open as deferred and are not reported again.

## Questions

- **Q-18:** CAT-20 rule 1 says "Its stem names its product (DEC-040)". Must the system refuse a catalog number, on add or on move, whose stem is not the product's `internal_code` (for example `BS-GHPV-L-100` under `BS-STI-L`)? The code does no such check, and DEC-042 forbids extracting the pack size.
