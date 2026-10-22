# e-IFU Resolution — Behavioural Specification

## Why this file exists

The Django implementation of e-IFU resolution is being deleted (ADR-0015). This
document is what survives it. It is written so that the behaviour can be rebuilt
in another language and be *the same behaviour* — not approximately, exactly.

Everything below was read out of the working implementation and its tests on
2026-09-04, not recalled. Where a value is a constant, the constant is here.
Where a rule is enforced by the database, the actual `pg_get_constraintdef`
output is here.

**If this document and a future implementation disagree, this document is
wrong until someone proves otherwise, and it is fixed in the same change.**

Source of the extraction, for anyone auditing it later:

| What | Was |
|---|---|
| Resolution algorithm | `backend/apps/eifu/services.py` |
| LOT parsing | `backend/apps/lots/lot_number.py` |
| Applicability and files | `backend/apps/documents/models.py` |
| Period creation and closure | `backend/apps/documents/services.py` |
| Public endpoint | `backend/apps/eifu/{views,serializers,access}.py` |
| Acceptance tests | `backend/apps/eifu/tests/test_resolution.py` |
| Constraint DDL | `pg_constraint` / `pg_indexes`, live database |

## The rule

> Resolve by **Product + LOT manufacturing date** against published effective
> periods. **Never by newest revision.**

A laboratory holding a box manufactured in June 2024 must be given the revision
that was in force in June 2024, forever — not the current one. An implementation
that sorts by revision, version number, publication date or `id` and takes the
first is wrong, and it will pass almost every test that is not specifically
looking for this.

There must be **no ordering by revision, version or date anywhere in the
resolver.** The applicable version is the one whose period contains the
manufacturing date: exactly one, or none.

## Inputs and outputs

A lookup is **two requests** (ADR-0018): the address is proved with a
one-time code before any document is released, so the identity on the access
record is one somebody demonstrated rather than one they typed. Both endpoints
are **unauthenticated**, which makes two rules absolute:

1. They never create or modify a `Product`, `CatalogNumber` or `Lot`. Anything
   they could create, anyone could create.
2. They are rate limited.

### Request — step one, `POST /api/v1/eifu/verification`

| Field | Type | Required | Notes |
|---|---|---|---|
| `catalog_number` | string, max 64 | yes | Whitespace-trimmed at the transport boundary |
| `lot_number` | string, max 64 | yes | Whitespace-trimmed at the transport boundary |
| `email` | email, max 254 | yes | Where the code is sent; recorded once proved. Retention applies (ADR-0018) |
| `notice_version` | string, max 32 | yes | Must equal `EIFU_LEGAL_NOTICE_VERSION` or `EIFU_NOTICE_VERSION_STALE` |
| `notice_accepted` | boolean | yes | Must be `true` or `EIFU_NOTICE_NOT_ACKNOWLEDGED` |

Answers `202` with a `verification_id`. The identifiers and the notice are held
on the pending verification, not re-sent at step two — so a code obtained for
one lookup cannot be spent on another.

### Request — step two, `POST /api/v1/eifu/resolve`

| Field | Type | Required | Notes |
|---|---|---|---|
| `verification_id` | uuid | yes | From step one |
| `code` | six digits | yes | `EIFU_VERIFICATION_CODE_INVALID`; five wrong codes spend the verification (`EIFU_VERIFICATION_TOO_MANY_ATTEMPTS`) |
| `first_name` | string, max 150 | no, default `""` | Accepted but not required |
| `last_name` | string, max 150 | no, default `""` | |

A code is single-use, and both the attempt count and the spend are atomic, so
concurrent submissions cannot exceed the limit or spend one code twice.

`first_name`/`last_name` exist so that requiring them later is a validation
change rather than a schema migration.

Consent is an **affirmative action**: `notice_accepted: false` is a rejection,
never an implied acceptance from the act of searching. The version is recorded
with it, because an acknowledgement without a version reference is not evidence
of anything.

### Successful response — HTTP 200

```json
{
  "catalog_number": "BS-GHPV-L-100",
  "lot_number": "B2603091224GHPVV",
  "manufacturing_date": "2026-03-09",
  "product_name": { "tr": "HPV Tespit Kiti", "en": "HPV Detection Kit" },
  "document_number": "KTL-0042",
  "document_title": { "tr": "...", "en": "..." },
  "revision": "03",
  "resolved_via_override": false,
  "files": [
    {
      "language_code": "de",
      "content_type": "application/pdf",
      "file_size_bytes": 481203,
      "file_hash": "…64 hex…",
      "download_url": "https://…signed, short-lived…"
    }
  ]
}
```

Deliberate properties of this shape:

- The **manufacturing date and revision are both reported**, so a user can see
  *why* this revision applies to their LOT.
- **Every available language is returned**, always, sorted by `language_code`.
  The system never substitutes one regulatory language for another.
- No row id, no storage key, no original filename, no active flag. A public
  caller learns nothing about how the catalogue is organised.
- `download_url` is issued per request and is short-lived. It is a presigned
  storage URL, and a presigned URL necessarily carries its object key; the key
  grants nothing without the signature and stops working when it expires. The
  file is named neutrally in it (`KTL-0042-rev03-tr.pdf`), never by the
  uploader's original filename. Serving through an opaque redirect would hide
  the key too, and is not built.
- There is **no success banner and no success colour** in the UI that renders
  this. Finding the document is the ordinary outcome; strong colour is spent
  only on problems (`design-system.md`).

### Failure response

The standard error envelope. `code` is always one of the outcomes below.

## The data the resolver reads

Seven tables. Names are the current physical names; a rewrite may rename them,
but the columns and the constraints are not negotiable.

### `products_product`

The canonical identity. There is no `EIFUProduct`. Applicability is
**product-level, never catalog-level** (ADR-0005).

### `catalogs_catalognumber`

`(product_id, catalog_number)`. `catalog_number` is unique. Carries `is_active`.

> **A deactivated catalog number still resolves.** Someone holding an old box
> still needs its instructions. `is_active` is not read by the resolver at all.

### `lots_lot`

| Column | Notes |
|---|---|
| `catalog_number_id` | FK. The LOT resolves to a product *through* this |
| `lot_number` | Stored **verbatim**. Never upper-cased, hyphen-stripped or normalised |
| `manufacturing_date` | Indexed. This is what selects the version |
| `manufacturing_date_source` | `PARSED_FROM_LOT` \| `SUPPLIED` \| `MANUAL_CORRECTION` |
| `expiry_date` | Nullable |
| `has_date_conflict` | A supplied date disagrees with the parsed one |

```sql
CONSTRAINT lot_unique_per_catalog_number UNIQUE (catalog_number_id, lot_number)
CONSTRAINT lot_expiry_after_manufacturing
  CHECK (expiry_date IS NULL OR expiry_date > manufacturing_date)
-- The pair lookup is served by the unique index above.
CREATE INDEX lot_number_idx ON lots_lot (lot_number)  -- step 4's disambiguation only
```

> `lot_resolution_idx (catalog_number_id, lot_number)` existed and was dropped
> (migration `20260926182252_lot_number_index`): it duplicated the unique index
> column for column. `lot_number_idx` was added because step 4's
> disambiguation was otherwise a sequential scan on an unauthenticated endpoint.

> **Uniqueness is per catalog number, not global.** Whether Bioeksen LOT numbers
> are unique company-wide is not a confirmed business invariant, and the schema
> does not assert what nobody has confirmed. **Never look a LOT up by
> `lot_number` alone** except for the one disambiguation in step 4.

### `documents_documentversion`

`status` is one of `DRAFT`, `PUBLISHED`, `SUPERSEDED`, `WITHDRAWN`.

```sql
CONSTRAINT documentversion_unique_revision UNIQUE (document_id, revision)
```

> **`PUBLICLY_RESOLVABLE = (PUBLISHED, SUPERSEDED)`.**
> `SUPERSEDED` is not an end state for retrieval. A 2024 LOT must resolve to its
> 2024 revision forever, and that revision has been superseded since 2025. A
> resolver that filters on `status = 'PUBLISHED'` breaks every historical LOT in
> the system and passes every test that only uses current LOTs.

### `documents_documentapplicability`

The join that carries the whole rule.

| Column | Notes |
|---|---|
| `document_version_id` | FK |
| `product_id` | FK — product-level (ADR-0005) |
| `effective_from` | **Inclusive** |
| `effective_to` | **Exclusive.** `NULL` means open-ended |
| `withdrawn_at` | Set on withdrawal. The row is retained; it stops resolving and stops constraining |

```sql
CONSTRAINT applicability_period_is_ordered
  CHECK (effective_to IS NULL OR effective_to > effective_from)

CONSTRAINT applicability_no_overlap_per_product
  EXCLUDE USING gist (
    product_id WITH =,
    daterange(effective_from, effective_to, '[)'::text) WITH &&
  ) WHERE (withdrawn_at IS NULL)

CREATE INDEX applicability_lookup_idx
  ON documents_documentapplicability (product_id, effective_from)
```

Requires the `btree_gist` extension.

Three things about this constraint that are easy to get wrong on a rewrite:

1. **The range is `[)`** — half-open. `effective_to` belongs to the *next*
   period. This is why 2025-01-01 resolves to revision 02 and not 01.
2. **A row exists only for a published fact.** It is created at publication,
   never while a version is a draft. That is what makes the overlap constraint
   both correct and enforceable — a draft with a proposed date must not
   reserve a period.
3. **The condition filters on `withdrawn_at`, a column of this table.** A
   PostgreSQL exclusion constraint cannot reach into `document_version.status`,
   which is why the lifecycle bit is denormalised here. Do not "clean this up"
   by joining to the version.

`documents_documentversion.proposed_effective_from` exists for drafts and is
**never read by a resolver**. It is materialised into an applicability row at
publication.

### `documents_documentfile`

| Column | Notes |
|---|---|
| `language_code` | BCP-47. **Not** limited to UI locales — a regulatory document may exist in languages the interface does not offer |
| `storage_key`, `file_hash`, `file_size_bytes`, `content_type` | Content-addressed: the key contains the SHA-256, so a replacement can never collide with what it replaces |
| `original_filename` | Retained for traceability. **Never** used to build a storage path |
| `is_active` | `false` once replaced. Row and stored object are both retained |

```sql
CREATE UNIQUE INDEX documentfile_one_active_per_language
  ON documents_documentfile (document_version_id, language_code)
  WHERE is_active
```

### `eifu_lotdocumentoverride`

The only thing that short-circuits normal resolution. Always requires a reason,
always audited.

```sql
CONSTRAINT lotoverride_reason_is_present CHECK (NOT (reason = ''))
CREATE UNIQUE INDEX lotoverride_one_active_per_lot
  ON eifu_lotdocumentoverride (lot_id) WHERE is_active
```

Deactivated, never deleted.

## LOT number parsing — ADR-0008

Two separate operations that are constantly confused. Keep them separate.

### Transport cleanup

Strips artefacts of **how a value travelled**, never semantics.

```
BOM              U+FEFF, removed from the start only
whitespace       " " \t \r \n U+00A0 U+2007 U+202F
quotes           " '
```

Applied as a **character-set strip from both ends**, in this order:

1. remove a leading BOM
2. strip whitespace characters from both ends
3. strip quote characters from both ends
4. strip whitespace characters from both ends again

Step 4 is not redundant: it handles `" B260309… "` — a quoted value that a CSV
exporter also padded.

> Note for a JavaScript reimplementation: this is **not** `String.trim()`.
> `trim()` does not remove `"`/`'`, and its whitespace set differs. Write the
> character-set strip explicitly.

What it must **not** do: change case, remove separators, rewrite internal
whitespace, pad, or truncate.

```
" B2603091224GHPVV "   ->  "B2603091224GHPVV"    transport, stripped
"b2603091224ghpvv"     ->  "b2603091224ghpvv"    case is semantic, kept
```

Applied **once, at the import boundary**, before validation. Never on data
already stored. The resolver applies it to user input for matching only;
nothing stored is modified, and the **raw** input is what the access record
keeps — what the user actually typed is what makes a failed lookup diagnosable.

### Manufacturing date extraction

```
B2603091224GHPVV
 ^^^^^^
 YYMMDD after the leading B   ->  2026-03-09
```

```
pattern        ^B(\d{2})(\d{2})(\d{2})(.{1,})$
century base   2000
```

Constants that matter:

- **`CENTURY_BASE = 2000`.** A two-digit year maps into this century. ADR-0008
  fixes the window rather than sliding it: a LOT predating 2000 is not a real
  case, and a sliding window would silently change what an old LOT means.
- **At least one trailing character is required.** A bare `B260309` is not a
  valid Bioeksen LOT.

Strict by design: it **rejects rather than repairs**, so a caller that skipped
the import boundary finds out immediately instead of silently resolving against
a guessed date.

| Failure | Code |
|---|---|
| Does not match the pattern | `EIFU_LOT_FORMAT_INVALID` |
| Matches, but the date segment is not a real calendar date | `EIFU_LOT_DATE_INVALID` |

This must live in **exactly one tested function**, and no substring arithmetic
on a LOT number may appear anywhere else in the codebase (ADR-0008).

The trailing segment is the **kit code**, which is *verified* against
`product.kit_code_base`, never *extracted* (ADR-0013). The resolver does not
use it.

## The resolution algorithm

Read-only. Exact order — several steps are only correct in this position.

```
INPUT: catalog_number (raw), lot_number (raw)

1.  catalog_input := clean_transport_artifacts(catalog_number)
    lot_input     := clean_transport_artifacts(lot_number)

2.  catalog := CatalogNumber WHERE catalog_number = catalog_input
    if none  ->  EIFU_CATALOG_NUMBER_NOT_FOUND
    (is_active is NOT consulted)

3.  lot := Lot WHERE catalog_number = catalog AND lot_number = lot_input
    exact match, case-sensitive, no normalisation

4.  if lot is none:
        if any Lot exists WHERE lot_number = lot_input
             ->  EIFU_LOT_CATALOG_MISMATCH   (product = catalog.product)
        else ->  EIFU_LOT_NOT_FOUND          (product = catalog.product)

5.  if lot.has_date_conflict
        ->  EIFU_LOT_DATE_CONFLICT

6.  override := LotDocumentOverride WHERE lot = lot AND is_active
    if override exists:
        if NOT override.document_version.status IN (PUBLISHED, SUPERSEDED)
             ->  EIFU_OVERRIDE_TARGET_NOT_PUBLISHED
        files := active_files(override.document_version)
        if files empty
             ->  EIFU_NO_FILE_FOR_VERSION   (resolved_via_override = true)
        ->  EIFU_RESOLVED                   (resolved_via_override = true)

7.  matches := DocumentApplicability
        WHERE product = catalog.product
          AND withdrawn_at IS NULL
          AND effective_from <= lot.manufacturing_date
          AND (effective_to IS NULL OR effective_to > lot.manufacturing_date)
          AND document_version.status IN (PUBLISHED, SUPERSEDED)
        LIMIT 2

    if matches is empty  ->  EIFU_NO_APPLICABLE_VERSION
    if |matches| > 1     ->  EIFU_AMBIGUOUS_APPLICABILITY

8.  version := matches[0].document_version
    files   := active_files(version)
    if files empty  ->  EIFU_NO_FILE_FOR_VERSION
    ->  EIFU_RESOLVED

active_files(version) :=
    DocumentFile WHERE document_version = version AND is_active
    ORDER BY language_code
```

Notes on individual steps:

- **Step 4** exists to distinguish "no such LOT" from "that LOT belongs to
  another product", because the second is a user error worth naming precisely.
  This is the **only** place a LOT is looked up by `lot_number` alone, and it
  is an existence check, not a resolution.
- **Step 5**: neither the parsed nor the supplied date wins automatically
  (ADR-0008). A human resolves it.
- **Step 7, `LIMIT 2`**: enough to detect ambiguity, without loading a set.
- **Step 7, no fallback.** A missing period means no applicable document, not
  that some other revision will do. There is no "nearest", no "earliest", no
  "latest".
- **Step 7, ambiguity**: the exclusion constraint should make `|matches| > 1`
  unreachable. If it happens the data is wrong, and guessing would be worse
  than failing.

## Outcomes

`outcome` is a registered code in every case, **including success**, so the
access record and the API response say the same thing.

| Outcome | HTTP | Meaning |
|---|---|---|
| `EIFU_RESOLVED` | 200 | |
| `EIFU_CATALOG_NUMBER_NOT_FOUND` | 404 | |
| `EIFU_LOT_NOT_FOUND` | 404 | |
| `EIFU_LOT_CATALOG_MISMATCH` | 409 | That LOT belongs to a different catalog number |
| `EIFU_LOT_DATE_CONFLICT` | 409 | Manufacturing date under review |
| `EIFU_NO_APPLICABLE_VERSION` | 404 | |
| `EIFU_AMBIGUOUS_APPLICABILITY` | 409 | Data defect |
| `EIFU_NO_FILE_FOR_VERSION` | 404 | Version resolved, no downloadable file |
| `EIFU_OVERRIDE_TARGET_NOT_PUBLISHED` | 409 | |
| `EIFU_LOT_FORMAT_INVALID` | 400 | Parsing only; not reachable from the resolver |
| `EIFU_LOT_DATE_INVALID` | 400 | Parsing only |
| `EIFU_NOTICE_NOT_ACKNOWLEDGED` | 400 | Request validation |
| `EIFU_NOTICE_VERSION_STALE` | 409 | Request validation |

## Access recording

**Every lookup is recorded, successful or not.** A failed lookup is as
analytically interesting as a successful one, and a rising
`EIFU_NO_APPLICABLE_VERSION` rate is a data-defect signal.

A request rejected at validation records nothing — no lookup happened.

Stored: raw `catalog_number_input` and `lot_number_input` (**not** the cleaned
ones), resolved product, resolved version, outcome, `resolved_via_override`,
language, action, `acknowledged_notice_version`, user agent (truncated to 512),
correlation id, client IP.

Client IP is Express's `request.ip` under the configured `trust proxy`: the
address the trusted proxy saw, never a value the caller wrote. Reading the
leftmost `X-Forwarded-For` entry directly, as an earlier version of this
specification said, would let a caller forge its own address.

Identifying fields (`email`, `first_name`, `last_name`, `ip_address`, and the
`visitor_id` that joins the record to the click stream) are **anonymised** after
`EIFU_ACCESS_RECORD_RETENTION_DAYS` — ten years by default (ADR-0018) — or
earlier on request; the row is **never deleted**. The period is a setting,
never a constant.

## What writes what the resolver reads

The resolver is read-only. Three write paths shape what it sees.

### Publication — `DRAFT -> PUBLISHED`

Opens a new applicability period for one product, in one transaction:

1. Refuse unless the version is `DRAFT` (`EIFU_VERSION_NOT_DRAFT`).
2. Refuse unless it has at least one active file (`EIFU_NO_FILE_FOR_VERSION`).
3. Find the product's currently open period (`effective_to IS NULL AND
   withdrawn_at IS NULL`), locking it.
4. If one exists:
   - refuse if `effective_from <= open_period.effective_from`
     (`EIFU_APPLICABILITY_OVERLAP`) — a new period must start *after* the one
     it supersedes;
   - set its `effective_to := effective_from` (this is the closure);
   - if the version holding it is `PUBLISHED` and is not this one, mark it
     `SUPERSEDED`.
5. Create the new applicability row, `effective_to = NULL`.
6. Mark the version `PUBLISHED`, stamp `published_at` / `published_by`.
7. Audit.

The superseded version **stays publicly resolvable** for LOTs manufactured
inside its own period. That is the entire point of resolving by date.

### Withdrawal — `PUBLISHED | SUPERSEDED -> WITHDRAWN`

Requires a reason. Stamps `withdrawn_at` on every live applicability row of
the version *first* — the exclusion constraint is immediate, so the withdrawn
row must leave the constraint's scope before anything can grow back into the
period it occupied.

LOTs in that period then return `EIFU_NO_APPLICABLE_VERSION`. **They are never
silently moved to another revision.**

`reopen_previous` is how an operator says what should happen instead:

- A revision published **in error** — the correct state of the world is the one
  before it. The period this version closed reopens, and the revision that held
  it becomes `PUBLISHED` again.
- A revision withdrawn because its **content is wrong** — that must *not*
  happen. The superseded revision was replaced for a reason, and serving it
  again would hand a laboratory a document quality had already moved past.

The system cannot tell those apart, so it refuses to guess. The default leaves
the gap, which fails loudly. The predecessor is found by **adjacency**: its
`effective_to` equals this period's `effective_from`, because that is the row
publication closed. Only meaningful for a version currently holding an open
period; withdrawing a historical one leaves a hole between two dated periods,
and filling it from either side would be inventing coverage nobody approved
(`EIFU_NO_PERIOD_TO_REOPEN`).

### Published-file replacement

A controlled correction of an already-published file. Requires a reason;
refuses a byte-identical replacement (`EIFU_FILE_HASH_MISMATCH`). The previous
row is deactivated, never deleted, and its stored object is never removed.
What users stop seeing, traceability keeps.

The replacement keeps the **same `language_code`** as the file it replaces. It
is not a field on the request: a Turkish IFU must not be swappable for a German
one.

## Invariants

1. Resolution is by product + manufacturing date. **Never** by newest revision.
2. `SUPERSEDED` versions remain publicly resolvable. `DRAFT` and `WITHDRAWN`
   never are.
3. No fallback. No applicable period means no document.
4. The public endpoint never writes `Product`, `CatalogNumber` or `Lot`.
5. LOT uniqueness is `(catalog_number, lot_number)`. Never resolve by
   `lot_number` alone.
6. A LOT number is stored verbatim. Transport cleanup at the boundary only.
7. Every language of the resolved version is returned. Never a substitute.
8. Controlled history is never destroyed: superseded versions, replaced files
   and withdrawn periods are all retained.
9. Every lookup is recorded, including failures.
10. Applicability is product-level, never catalog-level.

## Acceptance tests

Any implementation must pass all of these. They are the current suite,
restated as vectors so they can be written in any framework.

**Fixture** — one product `BS-GHPV`, one catalog number `BS-GHPV-L-100`, one
document, three revisions published in order:

| Revision | `effective_from` | `effective_to` | Status after setup |
|---|---|---|---|
| `01` | 2024-01-01 | 2025-01-01 | `SUPERSEDED` |
| `02` | 2025-01-01 | 2026-01-01 | `SUPERSEDED` |
| `03` | 2026-01-01 | *(open)* | `PUBLISHED` |

Each revision has active `tr` and `en` files.

### The core rule

| # | Given | Expect |
|---|---|---|
| 1 | LOT manufactured 2026-03-09 | resolves, product `BS-GHPV`, revision `03` |
| 2 | LOT manufactured 2024-06-15 | revision `01`, whose status is `SUPERSEDED` |
| 3 | LOT manufactured 2024-06-15 | **not** revision `03` — *this is the single most important assertion in the suite; an implementation that orders by revision passes everything else and fails only this* |
| 4 | LOT manufactured 2023-01-01 (before every period) | `EIFU_NO_APPLICABLE_VERSION`, no version returned |

### Period boundaries

`[from, to)` — the boundary belongs to the newer period.

| Manufactured | Revision |
|---|---|
| 2024-01-01 | `01` — first day, inclusive |
| 2024-12-31 | `01` |
| 2025-01-01 | `02` — boundary belongs to the newer period |
| 2025-12-31 | `02` |
| 2026-01-01 | `03` |
| 2030-06-01 | `03` — open-ended period |

### What must never reach the public

| # | Given | Expect |
|---|---|---|
| 5 | A `DRAFT` revision `04` exists | LOT of 2026-03-09 still resolves to `03` |
| 6 | Revision `01` is withdrawn | a 2024-06-15 LOT gets `EIFU_NO_APPLICABLE_VERSION` — **not** a different revision |

### Files

| # | Given | Expect |
|---|---|---|
| 7 | Revision `03` has `tr`, `en`, `de` | `files` = `["de", "en", "tr"]`, sorted by language code |
| 8 | The `tr` file of `03` is replaced | the new hash is present, the old hash is absent |
| 9 | All files of `03` are deactivated | `EIFU_NO_FILE_FOR_VERSION` |

### Overrides

| # | Given | Expect |
|---|---|---|
| 10 | Active override on the LOT → revision `01` | revision `01`, `resolved_via_override = true` |
| 11 | The override is deactivated | revision `03`, `resolved_via_override = false` |
| 12 | Override points at a `DRAFT` | `EIFU_OVERRIDE_TARGET_NOT_PUBLISHED` |
| 13 | A second active override is created for the same LOT | database integrity error |

### Lookup failures

| # | Given | Expect |
|---|---|---|
| 14 | Unknown catalog number | `EIFU_CATALOG_NUMBER_NOT_FOUND` |
| 15 | Unknown LOT for a known catalog number | `EIFU_LOT_NOT_FOUND` |
| 16 | The LOT exists, but under a different catalog number | `EIFU_LOT_CATALOG_MISMATCH` |
| 17 | `has_date_conflict = true` | `EIFU_LOT_DATE_CONFLICT` |
| 18 | Input `"  BS-GHPV-L-100  "` / `" B2603091224GHPVV "` | resolves — surrounding whitespace is transport |
| 19 | Input `"b2603091224ghpvv"` for a LOT stored as `"B2603091224GHPVV"` | `EIFU_LOT_NOT_FOUND` — **case is semantic, the lookup does not guess** |

### Boundaries of the public endpoint

| # | Given | Expect |
|---|---|---|
| 20 | Resolve an unknown catalog number, then an unknown LOT | `Product`, `CatalogNumber` and `Lot` row counts are unchanged |
| 21 | The catalog number is deactivated | still resolves — someone holding an old box still needs its instructions |

### What these vectors actually catch

Worth knowing before trusting them.

The rule says "never order by revision", and that stands — it signals intent and
costs nothing. But **adding an `orderBy` to a correct implementation changes
nothing**, because the `WHERE` clause has already reduced the result to one row,
and sorting one row is a no-op. Vector 3 does not fail against that mutation.

What the vectors do catch is the mutation that actually ships: **losing the date
filter.** Dropping `effective_from <= date AND (effective_to IS NULL OR
effective_to > date)` and taking the newest revision fails eight of them,
including vector 3, both historical-LOT vectors, all four boundary vectors and
the withdrawal vector.

So the guard here is the **filter**, not the absence of a sort. A reviewer
looking for "did somebody add an ORDER BY" is looking at the wrong line; the
question is whether both date conditions are still there and still on the
applicability row.

This was established by mutating the implementation and watching the suite,
not by reading it.

### LOT parsing vectors

Held in `shared/vectors/lot-number.json`, loaded by both the parser's tests
(`backend/src/lots/lot-number.spec.ts`) and
`scripts/tests/test_validate_bioeksen_lot.py` so the
authoritative parser and the operational CLI cannot drift apart.

**Carry that file over unchanged and keep both consumers.** It is data, not
Python — it survives the rewrite as-is. A new case is added there, never in one
suite.

Its five sections, reproduced so this document stands alone:

**`valid`**

| Input | Date | Why the case exists |
|---|---|---|
| `B2603091224GHPVV` | 2026-03-09 | the documented example |
| `B240101X` | 2024-01-01 | shortest legal form |
| `B991231ZZZZ` | 2099-12-31 | top of the century window |
| `B000101A` | 2000-01-01 | bottom of the century window |
| `B2402290000` | 2024-02-29 | leap day |

**`format_invalid`** → `EIFU_LOT_FORMAT_INVALID`

| Input | Why |
|---|---|
| `B260309` | no trailing identifier content |
| `2603091224GHPVV` | missing the `B` prefix |
| `b2603091224GHPVV` | lower-case prefix is a different identifier, never promoted |
| `BX603091224GHP` | non-numeric date segment |
| `B26030` | too short |
| `" B2603091224GHPVV "` | parser is strict; cleanup belongs at the import boundary |
| `""` | empty |

**`date_invalid`** → `EIFU_LOT_DATE_INVALID`

| Input | Why |
|---|---|
| `B269909XXXX` | month 99 |
| `B260032XXXX` | day 32 |
| `B260000XXXX` | month and day zero |
| `B250229XXXX` | 2025 is not a leap year |

**`transport_cleanup`** → all clean to `B2603091224GHPVV`

| Raw | Why |
|---|---|
| `" B2603091224GHPVV "` | surrounding spaces |
| `"\tB2603091224GHPVV\r\n"` | tabs and newlines |
| `"﻿B2603091224GHPVV"` | UTF-8 BOM on first cell |
| `"\"B2603091224GHPVV\""` | CSV exporter quotes |
| `"\xa0B2603091224GHPVV\xa0"` | non-breaking spaces |

**`semantics_preserved`** → cleanup must return these **unchanged**

| Raw | What must survive |
|---|---|
| `b2603091224ghpvv` | case |
| `B26-03-09-1224GHPVV` | separators |
| `B260309 1224GHPVV` | internal whitespace |

## Findings recorded while writing this

Two things surfaced during extraction that are **not** decisions, and must not
be silently preserved or silently changed by the rewrite.

### A date conflict blocks an override

Step 5 runs before step 6, so a LOT with `has_date_conflict = true` returns
`EIFU_LOT_DATE_CONFLICT` **even when an active override exists** — despite the
override existing precisely to bypass date resolution.

Two readings, and the code does not say which was meant:

- *Deliberate* — a LOT whose record is under review is untrustworthy as a
  whole, not just in its date, so nothing about it should resolve.
- *Accidental* — the conflict check was placed before the override branch
  because that is where the LOT was loaded, and nobody asked.

No test covers the combination. Whichever the rewrite implements, **write the
test**, because right now the behaviour is only an artefact of statement order.

The conservative reading is the one implemented and tested. It is tolerable
only because the conflict has an exit: `CatalogService.correctLotDate`, the
audited correction ADR-0008 names, clears the flag (`state-machines.md`, Lot
manufacturing date).

### Two layers of whitespace trimming

The transport layer trims `catalog_number` and `lot_number`, and then
`clean_transport_artifacts` strips a wider character set again. The second is
the one that matters and the one that is specified; the first is a framework
default that happens to overlap it.

A rewrite should apply the specified cleanup **once, explicitly**, rather than
inheriting a partial version of it from whatever the new framework trims by
default — otherwise the two disagree the first time a non-breaking space
arrives, and only one of them is documented.
