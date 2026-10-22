# Canonical Field-Level Data Model

`domain-model.md` names the canonical entities. This file fixes their **fields**,
so that field naming does not drift between sessions, developers, or AI agents.

If an implementation needs a field that is not listed here, add it here in the
same change. Do not invent a synonym for a field that already exists.

## Conventions

- Table and column names are `snake_case`; model classes are `PascalCase`.
- Booleans read as assertions: `is_active`, `is_published`, not `active`, `published`.
- Foreign keys are named after the target entity: `product`, `course_version`.
- Timestamps end in `_at`; dates end in `_date`; durations carry their unit: `retry_delay_minutes`.
- Enumerations are `TextChoices` with `UPPER_SNAKE` values, stored as `varchar`, never as integers.
- Every model inherits `created_at` and `updated_at` from an abstract base.
- Money, scores and percentages use `Decimal`, never `float`.

## Primary keys

Internal primary keys are `BigAutoField`. A separate indexed `UUIDField` is added
**only** where an identifier is exposed to an unauthenticated party, so that
sequential ids cannot be enumerated:

- `Certificate.verification_id`

Authenticated API endpoints may expose internal ids because object-level
authorization is enforced server-side (`api-conventions.md`).

## Unique constraints containing a nullable column

PostgreSQL treats `NULL` values as **distinct** in a `UNIQUE` constraint by
default, so `UNIQUE(a, b, c)` does not prevent two rows that share `a` and `b` and
both have `c IS NULL`. Every unique constraint in this file that includes a
nullable column therefore states which form it uses:

- `UNIQUE NULLS NOT DISTINCT (...)` — PostgreSQL 15+; the baseline is 16 (`tech-stack-versions.md`).
  Preferred: one constraint, one intent. Prisma cannot express it, so it is
  hand-written SQL in its own migration like every other constraint (ADR-0015).
- Or two partial constraints — one `WHERE col IS NULL`, one `WHERE col IS NOT NULL`.

Writing a plain `UNIQUE` across a nullable column is a defect, not a style choice.
It admits exactly the duplicate the constraint was added to prevent.

## Deletion policy

There is no soft-delete flag pattern in this project. Retention is expressed
through explicit lifecycle status fields (`SUPERSEDED`, `REVOKED`, `WITHDRAWN`).
Controlled records are never deleted. See `audit-traceability.md`.

## Localized content

Authored business content uses a JSONB column holding one entry per locale:

```json
{ "tr": "Kullanım Talimatı", "en": "Instructions for Use" }
```

Such fields are marked **localized** below. Required locales (`tr`, `en`) are
validated at the application boundary and enforced by a database check
constraint. Static UI strings never use this mechanism — they use translation
keys (`localization.md`). Rationale: ADR-0009.

---

## Product domain

### Product

| Field | Type | Notes |
|---|---|---|
| `internal_code` | `varchar(64)` | The catalog stem — see ADR-0012. Not unique alone; see the constraint below. |
| `name` | localized JSONB | Commercial product name. |
| `description` | localized JSONB, nullable | |
| `regulatory_status` | enum `IVD` / `RUO` | Default `IVD`. Part of product identity: an RUO variant is a different product with its own IFU (ADR-0012). |
| `kit_code_base` | `varchar(32)`, blank | The product's own part of the LOT kit code. Administrator-maintained; it cannot be derived (ADR-0013). Blank means lots for this product go unchecked. |
| `is_active` | `boolean` | Default `true`. Never deleted. |

Constraint: `UNIQUE(internal_code, regulatory_status)` — `BS-STI-L` exists once
as IVD and once as RUO, and they are different products.

### CatalogNumber

| Field | Type | Notes |
|---|---|---|
| `product` | FK -> `Product`, `PROTECT` | A CatalogNumber belongs to exactly one Product. |
| `catalog_number` | `varchar(64)` | **Unique across the whole table.** Identity does not vary by country. |
| `pack_size` | `varchar(32)`, nullable | Business metadata only. **Never parsed** — the trailing number in the catalog number disagrees with it in 111 of 553 real rows. |
| `format` | enum `VCAP` / `LYOPHILIZED` / `LIQUID`, nullable | Determines the LOT kit code's final letter (ADR-0013). On the catalog number, not the product: it varies within 14 of 322 products. |
| `is_active` | `boolean` | |

Constraint: `UNIQUE(catalog_number)`.

### Lot

| Field | Type | Notes |
|---|---|---|
| `catalog_number` | FK -> `CatalogNumber`, `PROTECT` | Resolves transitively to one Product. |
| `lot_number` | `varchar(64)` | Unique **per catalog number** — see below. Stored exactly as supplied apart from surrounding whitespace; never upper-cased, hyphen-stripped or otherwise semantically normalised (ADR-0008). |
| `manufacturing_date` | `date` | Parsed or supplied. See `eifu-imports.md`. |
| `manufacturing_date_source` | enum `PARSED_FROM_LOT` / `SUPPLIED` / `MANUAL_CORRECTION` | Provenance is required for traceability. |
| `expiry_date` | `date`, nullable | |
| `has_date_conflict` | `boolean` | `true` when supplied and parsed dates disagree; blocks silent resolution. Cleared only by an audited correction (`state-machines.md`, Lot manufacturing date). |
| `import_batch` | FK -> `ImportBatch`, `SET_NULL`, nullable | |

Constraint: `UNIQUE(catalog_number, lot_number)`.

> **Why composite rather than `UNIQUE(lot_number)`.** Bioeksen LOT numbers may
> well be globally unique in practice, but that has **not been confirmed as a
> business invariant**. A global unique constraint asserts something we do not
> know, and it fails closed in the wrong direction: a legitimate LOT that happens
> to collide across two products would be rejected at import with no safe
> workaround.
>
> The composite constraint is the weaker, honest claim, and it is exactly what
> resolution needs — a lookup always arrives with both a catalog number and a LOT
> number (`eifu-domain.md`).
>
> **Deferred 2026-08-23.** Whether to tighten to `UNIQUE(lot_number)` is a
> question to revisit once real import data exists, not one to settle now. The
> composite constraint is correct under either answer, so nothing is blocked by
> leaving it. Tightening later is a safe, additive migration; loosening a
> constraint after it has rejected legitimate data is not.
>
> Resolution consequence: a LOT lookup **must** filter on the catalog number as
> well. Selecting a `Lot` by `lot_number` alone is a defect, and a
> catalog/LOT pair that does not match returns `EIFU_LOT_CATALOG_MISMATCH`.

### ImportBatch

Extends the entity list in `domain-model.md`; required by the import-report rule
in `eifu-imports.md`.

| Field | Type | Notes |
|---|---|---|
| `import_type` | enum `CATALOG_NUMBER` / `LOT` | |
| `source_filename` | `varchar(255)`, nullable | Null when the rows were pasted rather than uploaded. |
| `source_file_hash` | `char(64)` | SHA-256 of the file's bytes or the pasted text, for re-import detection. A match is reported at preview as a warning, never refused: re-importing after fixing a catalog number is legitimate. |
| `product` | FK -> `Product`, `PROTECT`, nullable | Set when the import was run from a product's page; rows naming another product's catalog numbers were refused. |
| `uploaded_by` | FK -> `User`, `PROTECT` | |
| `status` | enum `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED` | |
| `row_count` / `created_count` / `skipped_count` / `conflict_count` / `failed_count` | `integer` | CHECK: a `COMPLETED` batch's four counts add up to `row_count`. |
| `failure_code` | `varchar(64)`, nullable | Set exactly when `FAILED`: the error code of what stopped it. |
| `completed_at` | `datetime`, nullable | Set exactly when `COMPLETED` or `FAILED`. |

### ImportRowResult

| Field | Type | Notes |
|---|---|---|
| `import_batch` | FK -> `ImportBatch`, `CASCADE` | |
| `row_number` | `integer` | 1-based, matching the source file. |
| `outcome` | enum `CREATED` / `ALREADY_EXISTS` / `CONFLICT_REVIEW_REQUIRED` / `INVALID_CATALOG_NUMBER` / `INVALID_LOT_FORMAT` / `INVALID_DATE` / `FAILED` | Mirrors `eifu-imports.md`. |
| `message` | `text` | The row's reason code (`eifu-imports.md`, *Row reasons*). Never a localized string. |
| `raw_row` | JSONB | The imported columns' cells as they arrived, before transport cleanup: `{ "catalog_number", "lot_number", "manufacturing_date" }`, each only when the source has it. Other columns of the sheet are never stored — an export can carry a customer or a contact, and this table is kept for good. |
| `lot` | FK -> `Lot`, `SET_NULL`, nullable | The LOT the row created, or the existing one it matched. |

Constraint: `UNIQUE(import_batch, row_number)`.

---

## Document / e-IFU domain

### Document

| Field | Type | Notes |
|---|---|---|
| `document_number` | `varchar(64)` | Unique. Identity in Bioeksen's quality system. |
| `document_type` | enum `IFU` | Extensible; do not widen into a generic DMS. |
| `title` | localized JSONB | |
| `product` | FK -> `Product`, `PROTECT`, nullable | The one product this IFU is for. Required by the API when a document is created; publication applies a revision to it rather than asking. Changeable only while no revision has ever been published (`EIFU_DOCUMENT_ALREADY_PUBLISHED`); a document with none may be bound only to the product its live periods name. Both rules are also triggers (`document_product_is_settled`, `applicability_on_document_product`), and publication locks the document row against a concurrent rebinding. Publication may name the product it showed (`expected_product_id`; `EIFU_DOCUMENT_PRODUCT_CHANGED` if stale). Nullable only for documents that predate it; publication refuses those (`EIFU_DOCUMENT_PRODUCT_REQUIRED`). |

### DocumentVersion

| Field | Type | Notes |
|---|---|---|
| `document` | FK -> `Document`, `PROTECT` | |
| `revision` | `varchar(16)` | Business revision label, e.g. `03`. |
| `status` | enum `DRAFT` / `PUBLISHED` / `SUPERSEDED` / `WITHDRAWN` | Only `PUBLISHED` and `SUPERSEDED` are publicly resolvable. |
| `proposed_effective_from` | `date`, nullable | A draft's intended start date. Never read by a resolver; materialised into `DocumentApplicability` at publication. |
| `published_at` / `published_by` | `datetime` / FK -> `User` | Nullable until publication. |
| `superseded_at` | `datetime`, nullable | |

Constraint: `UNIQUE(document, revision)`.

### DocumentApplicability

Carries the effective period, because applicability — not the version record —
is what binds a document to a Product over time.

**A row exists only for a published fact.** `DocumentApplicability` is created by
`publish_document_version`, never while a version is a draft. A draft records its
intended start date on `DocumentVersion.proposed_effective_from`, which no
resolver ever reads. This is what makes the overlap constraint below both
correct and enforceable.

| Field | Type | Notes |
|---|---|---|
| `document_version` | FK -> `DocumentVersion`, `PROTECT` | Always `PUBLISHED` or `SUPERSEDED` at creation time. |
| `product` | FK -> `Product`, `PROTECT` | Applicability is **product-level**. Never CAT-level. |
| `effective_from` | `date` | Inclusive. |
| `effective_to` | `date`, nullable | Exclusive. `NULL` means open-ended. |
| `withdrawn_at` | `datetime`, nullable | Set when the version is withdrawn. The row is retained; it simply stops constraining and stops resolving. |

Constraints:

- `CHECK (effective_to IS NULL OR effective_to > effective_from)`
- No two live applicability rows for the same `product` may have overlapping
  periods:

```python
ExclusionConstraint(
    name="documentapplicability_no_overlap_per_product",
    expressions=[
        ("product", RangeOperators.EQUAL),
        (DateRange("effective_from", "effective_to", RangeBoundary()), RangeOperators.OVERLAPS),
    ],
    condition=Q(withdrawn_at__isnull=True),
)
```

Requires the `btree_gist` extension. It is created in the same migration as the
constraint that depends on it, so the ordering cannot come apart.

> **Why `withdrawn_at` lives on this table.** A PostgreSQL exclusion constraint
> can only reference columns of its own table. It cannot filter on
> `document_version__status`, so an earlier formulation of this rule — "no
> overlap among `PUBLISHED`/`SUPERSEDED` versions" — was not implementable as
> stated and would have quietly degraded into an application-level check.
>
> Keeping the lifecycle bit local, and creating rows only at publication, makes
> the database the enforcer. That matters here more than almost anywhere else in
> the schema: overlapping applicability is the data defect that makes e-IFU
> resolution ambiguous, and `EIFU_AMBIGUOUS_APPLICABILITY` should be a
> theoretical branch, not a routine one.
>
> `withdrawn_at` is denormalised from `DocumentVersion.status`. Both are set in
> the same transaction by `withdraw_document_version`; neither is written
> anywhere else.

### DocumentFile

| Field | Type | Notes |
|---|---|---|
| `document_version` | FK -> `DocumentVersion`, `PROTECT` | |
| `language_code` | `varchar(8)` | BCP-47, e.g. `tr`, `en`, `de`. Not limited to UI locales. |
| `storage_key` | `varchar(512)` | Object storage key. See `object-storage.md`. |
| `file_hash` | `char(64)` | SHA-256 of the stored bytes. |
| `file_size_bytes` | `bigint` | |
| `content_type` | `varchar(128)` | Server-detected, never the client-supplied claim. |
| `original_filename` | `varchar(255)` | Retained for traceability, never used to build a storage path. |
| `is_active` | `boolean` | `false` once replaced; the row is retained. |

Constraint: at most one `is_active` row per `(document_version, language_code)`.

### DocumentFileReplacement

| Field | Type | Notes |
|---|---|---|
| `document_version` | FK -> `DocumentVersion`, `PROTECT` | |
| `language_code` | `varchar(8)` | |
| `previous_file` | FK -> `DocumentFile`, `PROTECT` | Never deleted. |
| `replacement_file` | FK -> `DocumentFile`, `PROTECT` | |
| `previous_file_hash` / `replacement_file_hash` | `char(64)` | Denormalised deliberately, so the trace survives independently. |
| `replaced_by` | FK -> `User`, `PROTECT` | |
| `replaced_at` | `datetime` | |
| `reason` | `text` | Required. Not nullable, not blank. |

### LotDocumentOverride

| Field | Type | Notes |
|---|---|---|
| `lot` | FK -> `Lot`, `PROTECT` | |
| `document_version` | FK -> `DocumentVersion`, `PROTECT` | Must be `PUBLISHED` or `SUPERSEDED`. |
| `reason` | `text` | Required. |
| `created_by` | FK -> `User`, `PROTECT` | |
| `is_active` | `boolean` | Deactivated, never deleted. |

Constraint: at most one `is_active` override per `lot`.

### EIFUAccessRecord

Personal data. Read `privacy-data-residency.md` before touching this model.

| Field | Type | Notes |
|---|---|---|
| `email` | `varchar(254)` | |
| `first_name` / `last_name` | `varchar(150)`, nullable | Policy-gated; see ADR-0007. |
| `ip_address` | `inet`, nullable | |
| `catalog_number_input` / `lot_number_input` | `varchar(64)` | Raw user input, retained even when resolution fails. |
| `resolved_product` | `uuid`, nullable — **loose reference**, no FK | A product is never deleted, and the access record outlives any change to how the catalogue is modelled — like `AuditEvent.entity_id`. |
| `resolved_document_version` | `uuid`, nullable — **loose reference**, no FK | Same reasoning; a document version is never deleted either. |
| `outcome` | enum mirroring the `EIFU_*` error codes | See `error-codes.md`. |
| `language_code` | `varchar(8)`, nullable | Which language the user acted on. |
| `action` | enum `RESOLVE` / `VIEW` / `DOWNLOAD` | |
| `acknowledged_notice_version` | `varchar(32)` | Which legal notice text the user accepted. |
| `user_agent` | `varchar(512)`, nullable | |
| `correlation_id` | `uuid` | Links to structured logs. |
| `anonymised_at` | `datetime`, nullable | Set by the retention job when the identifying columns are cleared. `NULL` means still identifying. |

Retention (ADR-0018): identifiers are retained for **ten years**
(`EIFU_ACCESS_RECORD_RETENTION_DAYS` defaults to `3650`), then anonymised, and
cleared earlier on request. Both clear `email`, `email_hash`, `identity_key_id`,
`first_name`, `last_name`, `ip_address` and `visitor_id` and stamp
`anonymised_at`; `eifuaccess_anonymised_keeps_no_handle` refuses an anonymised
row that keeps any of them. `0` disables the scheduled pass.
**The row is never deleted** either way: every other column is what makes the
access history and the analytics work, and none of it identifies anyone. See
`privacy-data-residency.md`.

`visitor_id` (`varchar(64)`, nullable) joins the lookup to the anonymous
browsing that led to it, so an erasure request made by email reaches the click
stream of the person who made it. Absent when the visitor has analytics blocked
— there is simply nothing to join.

Index `created_at` and `anonymised_at` together — the retention job's predicate is
`created_at < cutoff AND anonymised_at IS NULL`, and it will run against a large
table.

### AnalyticsEvent

Personal data, by decision (ADR-0016): identifiers are retained indefinitely and
cleared on request. **Not the audit trail** — `analytics.md` draws that boundary
and it is load-bearing: this table may be pruned, sampled and re-derived, and
`AuditEvent` may not. Never satisfy an audit requirement from here.

| Field | Type | Notes |
|---|---|---|
| `event_type` | enum `PAGE_VIEW` / `CLICK` | |
| `user_id` | FK -> `User`, `SET_NULL`, nullable | The signed-in person. `NULL` on the public pages before anybody identifies themselves. |
| `visitor_id` | `varchar(64)` | Stable per browser, from a first-party cookie. A pseudonym: it identifies a browser, and becomes attributable when the person signs in or submits the e-IFU form. |
| `area` | enum `EIFU` / `ACADEMY` / `BACKOFFICE` / `AUTH` | So a query does not have to parse paths. |
| `route_pattern` | `varchar(255)` | `/backoffice/documents/:id`, never the resolved URL. It aggregates without a `GROUP BY` over unbounded distinct values, and it keeps record ids out of a table that has no use for them. |
| `label` | `varchar(128)` | For a `CLICK`, the `data-analytics` attribute. **Authored by developers**, never derived from the visible text — that is translated, and would make one button look like two. |
| `referrer` | `varchar(255)` | First-party route patterns only. |
| `language_code` | `varchar(8)` | UI language at the moment of the event. Never which document was served. |
| `ip_address` | `varchar(512)`, nullable | The client address, **encrypted at rest** with the same key ring as `EifuAccessRecord.ip_address` (ADR-0017). Kept for investigation; used by no aggregate. `NULL` means one of four things the row's other columns tell apart: no key ring configured, written before the column existed, erased, or encrypted under a retired key. Reading it needs `analytics.event.view_raw`. |
| `occurred_at` | `datetime` | As the browser reported it, clamped to `received_at`. |
| `received_at` | `datetime` | A batch can arrive minutes after the click and a client clock can be wrong; keeping both is what makes that visible. |
| `correlation_id` | `varchar(64)` | Joins to the structured logs. |
| `anonymised_at` | `datetime`, nullable | Set by an erasure request, which clears `user_id`, `visitor_id` and `ip_address` together. The address identifies a household as surely as the visitor id identifies a browser. |

Constraints: `analyticsevent_anonymised_names_nobody` — a stamped row carrying
either identifier, **or the address**, is a row that claims to have been erased
and was not, which is the one failure of this mechanism a reader could not spot.
`analyticsevent_occurred_before_received` — a future timestamp would sit outside
every date window forever, invisible in the dashboards it was meant to appear
in.

Every index leads with the date range, because every dashboard query is windowed
by a required one (`analytics.md` rule 2).

---

## Organization and identity

### User

Custom user model. `USERNAME_FIELD = "email"`; there is no `username` column.

| Field | Type | Notes |
|---|---|---|
| `email` | `varchar(254)` | Unique, case-insensitive (`CITEXT` or a normalised lower-case column). |
| `first_name` / `last_name` | `varchar(150)` | |
| `preferred_text_scale` | `varchar(16)` | `small` / `normal` / `large` / `larger`, default `normal`. CHECK `user_text_scale_is_known`. A **multiplier** on the browser's own font-size setting, never a replacement: the type scale is in `rem`, so somebody who raised their browser default already gets larger text and this moves it further. On the person rather than in the browser because it is a property of their eyes, not of the machine they are at. |
| `preferred_language` | `varchar(8)` | `tr` or `en`. UI preference only. |
| `is_active` | `boolean` | Deactivation is the offboarding mechanism; users are not deleted. |

There is no `InternalUser`, `CustomerUser` or `DistributorUser` model.

### Organization

| Field | Type | Notes |
|---|---|---|
| `code` | `varchar(64)` | Unique. |
| `name` | `varchar(255)` | Legal name; not localized. |
| `organization_type` | enum `INTERNAL` / `CUSTOMER` / `DISTRIBUTOR` / `DEPARTMENT` | |
| `country_code` | `varchar(2)`, nullable | ISO 3166-1 alpha-2. |
| `is_active` | `boolean` | |

### OrganizationMembership

| Field | Type | Notes |
|---|---|---|
| `user` | FK -> `User`, `PROTECT` | |
| `organization` | FK -> `Organization`, `PROTECT` | |
| `is_active` | `boolean` | |

Constraint: `UNIQUE(user, organization)`.

### OrganizationRelationship

| Field | Type | Notes |
|---|---|---|
| `from_organization` | FK -> `Organization`, `PROTECT` | The distributor. |
| `to_organization` | FK -> `Organization`, `PROTECT` | The customer. |
| `relationship_type` | enum `DISTRIBUTES_TO` | |
| `is_active` | `boolean` | |

Constraints: `UNIQUE(from_organization, to_organization, relationship_type)` and
`CHECK (from_organization_id <> to_organization_id)`.

### Permission, Role, RoleAssignment

| Model | Field | Notes |
|---|---|---|
| `Permission` | `code` | Unique, e.g. `academy.course.approve`. The authoritative list is `permission-matrix.md`. |
| `Permission` | `description` | English. |
| `Role` | `code`, `name` | A role is a named bundle, never the authorization check itself. |
| `RolePermission` | `role`, `permission` | `UNIQUE(role, permission)`. |
| `RoleAssignment` | `user`, `role`, `organization` (nullable) | `NULL` organization means platform-wide scope. |
| `RoleAssignment` | `is_active`, `assigned_by`, `assigned_at` | Deactivated, never deleted. Every change is audited. |
| `AuthToken` | `user`, `purpose` | `INVITATION` opens an account for the first time; `PASSWORD_RESET` reopens one. One mechanism, because both are "prove you read this address, then set a password". |
| `AuthToken` | `token_hash` | Hex SHA-256, unique. The token itself is in the message and nowhere else, so a database dump yields no working credential. Not the HMAC the e-IFU code uses: that one is six digits and needs a pepper, this one is 256 random bits and has no candidate set to search. |
| `AuthToken` | `expires_at`, `used_at` | Single-use and expiring. Invitations live 14 days, resets 1 hour. `authtoken_one_live_per_purpose` — partial unique on the unspent rows — keeps a superseded link from still working. |
| `AuthToken` | `created_by` (nullable) | Who issued it. `NULL` for a reset, which nobody issues but its owner. Rows are kept after redemption: "invited on the 3rd, accepted on the 9th" is a question asked about an external account. |

`RoleAssignment` uniqueness, stated precisely because the scope column is nullable:

```python
UniqueConstraint(
    fields=["user", "role", "organization"],
    name="roleassignment_unique_per_scope",
    nulls_distinct=False,
)
```

Without `nulls_distinct=False`, PostgreSQL treats each `NULL` organization as
distinct and the same platform-wide role can be granted to the same user any
number of times. That is not merely untidy: duplicated platform-scoped grants
make revocation incomplete — removing one row leaves the privilege in place —
which is the failure mode you least want in the permission that grants other
permissions.

---

## Academy domain

### Course

| Field | Type | Notes |
|---|---|---|
| `code` | `varchar(64)` | Unique, stable across versions. |
| `owning_organization` | FK -> `Organization`, `PROTECT` | Always an `INTERNAL` organization. |
| `is_active` | `boolean` | |
| `audience` | `CourseAudience` | `EVERYONE` (default) / `INTERNAL` / `DEPARTMENTS`. Who the course is FOR, which is not who owns it: every course is owned by Bioeksen, and that says nothing about whether a distributor's training manager should be reading an internal contamination quiz. Chosen by the author or an administrator. |
| `listed_in_catalogue` | `boolean`, default `false` | Shown in the learner catalogue, where somebody in its `audience` who has not been assigned it can ask for access (`CourseAccessRequest`). Off by default: listing a course invites requests for it. |

Titles live on `CourseVersion` because they are versioned content.

`audience` narrows who the course is OFFERED to, never who may administer it:
somebody holding `academy.course.create` sees every course whatever its
audience, because they are the ones who choose it. `EVERYONE` is the default
because the narrower settings are a restriction somebody decides on — defaulting
to one would hide published training from people already enrolled.

### CourseAudienceDepartment

Which departments, when `Course.audience` is `DEPARTMENTS`.

| Field | Type | Notes |
|---|---|---|
| `course` | FK -> `Course`, `CASCADE` | Part of the primary key. |
| `organization` | FK -> `Organization`, `RESTRICT` | Part of the primary key. Must be a `DEPARTMENT` (`course_audience_target_is_a_department`). |

A join table rather than an array column: these are foreign keys, and a
department deleted out from under an array leaves a course pointing at nothing
with nobody to notice.

The two facts are kept in step by one deferred constraint trigger in both
directions — `DEPARTMENTS` with no rows, and rows under any other audience, are
both refused at `COMMIT`. Deferred rather than immediate because the two facts
live in two tables, and a service writing them in either order would trip an
immediate check halfway through a correct transaction.

### CourseVersion

| Field | Type | Notes |
|---|---|---|
| `course` | FK -> `Course`, `PROTECT` | |
| `version_number` | `integer`, nullable | **`NULL` until publication**, assigned there. A version that never publishes never consumes a number, so the sequence describes releases rather than attempts. |
| `status` | enum `DRAFT` / `IN_REVIEW` / `APPROVED` / `PUBLISHED` / `SUPERSEDED` / `DISCARDED` | Transitions: `state-machines.md`. |
| `discarded_at` / `discarded_by` / `discard_reason` | | Set when an unpublished version is abandoned. The row and its content tree are retained. |
| `title` / `description` | localized JSONB | |
| `created_by` | FK -> `User`, `PROTECT` | The author. |
| `submitted_at` / `submitted_by` | | Set on `DRAFT -> IN_REVIEW`. |
| `assigned_reviewer` | FK -> `User`, `PROTECT`, nullable | |
| `reviewed_at` / `reviewed_by` | | Review completion is distinct from approval. |
| `approved_at` / `approved_by` | | **`approved_by` must differ from `created_by`.** |
| `published_at` / `published_by` | | Publication is distinct from approval. |
| `superseded_at` | `datetime`, nullable | |
| `superseded_by` | FK -> `CourseVersion`, `PROTECT`, nullable | |
| `new_version_policy` | enum `NO_ACTION` / `ASSIGN_NEW_VERSION` / `REQUIRE_RECERTIFICATION` | What happens to learners who **already completed** this version. Set by the author. |
| `existing_certificate_policy` | enum `KEEP_UNTIL_EXPIRY` / `EXPIRE_AFTER_GRACE_PERIOD` / `EXPIRE_IMMEDIATELY` | What happens to *already-issued certificates*. Default `KEEP_UNTIL_EXPIRY`. Only consulted when `new_version_policy = REQUIRE_RECERTIFICATION`. |
| `recertification_grace_period_days` | `integer`, nullable | Required when `existing_certificate_policy = EXPIRE_AFTER_GRACE_PERIOD`. |
| `certificate_enabled` | `boolean` | |
| `certificate_validity_months` | `integer`, nullable | `NULL` means unlimited validity. |
| `completion_rules` | JSONB + `schema_version` | Declarative; validated on both ends. |

Constraints:
- `UNIQUE(course, version_number)` with `nulls_distinct=True` — unpublished versions all hold `NULL` and must not collide with one another
- At most one version per course in `DRAFT`, `IN_REVIEW` or `APPROVED`, enforced by a partial unique index on `course`
- `CHECK (status <> 'PUBLISHED' OR version_number IS NOT NULL)`
- `CHECK (status <> 'DISCARDED' OR (discarded_at IS NOT NULL AND discard_reason <> ''))`
- `CHECK (approved_by_id IS NULL OR approved_by_id <> created_by_id)` — separation of duties enforced in the database, not only in a service.
- At most one `PUBLISHED` version per course (partial unique index).
- `CHECK (existing_certificate_policy <> 'EXPIRE_AFTER_GRACE_PERIOD' OR recertification_grace_period_days IS NOT NULL)`

> **Why certificate fate is a separate field.** "This version's content changed
> enough that people must retrain" and "everyone's current certificate is void as
> of this second" are different business statements, and only the first was ever
> a requirement. Collapsing them meant publishing v2 silently invalidated a v1
> certificate that had three months left to run — a consequential act with real
> compliance impact, triggered as a side effect of a routine publish.
>
> `KEEP_UNTIL_EXPIRY` is the default because it is the conservative reading.
> Immediate invalidation remains available; it is now something an authorised
> person chooses, per course, rather than something the system does on their
> behalf.

### Module / Lesson

| Field | Type | Notes |
|---|---|---|
| `course_version` (Module) / `module` (Lesson) | FK, `CASCADE` | Draft content is owned by its version. |
| `display_order` | `integer` | `UNIQUE(parent, display_order)`, contiguous from 0. |
| `title` | localized JSONB | |

### ContentBlock

| Field | Type | Notes |
|---|---|---|
| `lesson` | FK -> `Lesson`, `CASCADE` | |
| `display_order` | `integer` | |
| `block_type` | `varchar(64)` | Registry key, e.g. `pcr_curve`. See `learning-engine.md`. |
| `schema_version` | `integer` | Required on every block. |
| `config` | JSONB | Declarative data. **Never executable code.** |
| `is_scoreable` | `boolean` | Drives whether `ActivityAttempt` rows are created. |

### CourseAsset

One uploaded course image, held once and referenced by key from any number of
blocks in any number of versions. Not scoped to a course — see
`object-storage.md` on why the key carries only the digest.

| Field | Type | Notes |
|---|---|---|
| `storage_key` | `varchar(512)`, unique | Derived from `sha256` alone. Uniqueness is what makes a re-upload resolve to the same asset instead of duplicating it. |
| `sha256` | `char(64)` | Lower-case hex, computed by the server. CHECK `courseasset_sha256_is_lower_hex`. |
| `content_type` | `varchar(64)` | Detected from the magic number. CHECK `courseasset_content_type_allowed` — PNG, JPEG, WebP, GIF. **SVG is excluded**: it can carry script and media is served inline. |
| `size_bytes` | `bigint` | CHECK `courseasset_size_is_positive`. Cap is `MAX_IMAGE_BYTES` (8 MB). |
| `original_filename` | `varchar(200)` | Traceability and nothing else. Never a path component, never the image's description — that is the block's localized `alt`. |
| `uploaded_by` | FK -> `User`, nullable, `SET NULL` | The asset outlives its uploader; published blocks reference its key. |

Never deleted. A key referenced by a published block has no view that could
list, before the click, every version still using it.

### Assessment / Question

| Model | Field | Notes |
|---|---|---|
| `Assessment` | `course_version`, `lesson` (nullable) | A lesson-level or course-level assessment. |
| `Assessment` | `passing_score` | `Decimal(5,2)`, percentage. |
| `Assessment` | `max_attempts` | `integer`, nullable = unlimited. |
| `Assessment` | `randomize_questions`, `randomize_answers` | `boolean`. |
| `Assessment` | `answer_visibility` | enum `NEVER` / `AFTER_EACH_ATTEMPT` / `AFTER_PASS` / `AFTER_FINAL_ATTEMPT`. |
| `Assessment` | `retry_delay_minutes` | `integer`, nullable. |
| `Assessment` | `remediation_policy` | enum `NONE` / `REPEAT_LESSON` / `REPEAT_MODULE` / `REPEAT_COURSE`. |
| `Question` | `assessment`, `display_order` | |
| `Question` | `question_type` | enum `SINGLE_CHOICE` / `MULTIPLE_CHOICE` / `TRUE_FALSE` / `ORDERING` / `MATCHING`. `MATCHING` is in the enum and cannot be authored or answered — see `deferred-work.md`. |
| `Question` | `prompt` | localized JSONB. |
| `Question` | `options` | JSONB, localized per option. |
| `Question` | `correct_answer` | JSONB. **Never serialized to the learner API.** |
| `Question` | `points` | `Decimal(6,2)`. |

### Attempts and progress

| Model | Field | Notes |
|---|---|---|
| `AssessmentAttempt` | `user`, `assessment`, `attempt_number` | `UNIQUE(user, assessment, attempt_number)`. |
| `AssessmentAttempt` | `started_at`, `submitted_at` | |
| `AssessmentAttempt` | `score`, `max_score` | `Decimal(6,2)`. |
| `AssessmentAttempt` | `passed` | `boolean`. Computed server-side only. |
| `AssessmentAttempt` | `answers` | JSONB. |
| `ActivityAttempt` | `user`, `content_block`, `attempt_number` | Common infrastructure for every scoreable block. |
| `ActivityAttempt` | `started_at`, `completed_at`, `score`, `max_score`, `passed`, `attempt_data` | Matches `learning-engine.md`. |
| `Enrollment` | `user`, `course_version` | `UNIQUE(user, course_version)`. |
| `Enrollment` | `status` | enum `NOT_STARTED` / `IN_PROGRESS` / `COMPLETED`. |
| `Enrollment` | `started_at`, `completed_at` | |
| `Enrollment` | `grace_period_ends_at` | `datetime`, nullable. Set when a newer version published under `ALLOW_GRACE_PERIOD`: the learner may finish this version until then. Set to the publication moment under `MOVE_IMMEDIATELY`, which closes an unfinished enrollment without marking it completed. Past, the enrollment can no longer be opened. |
| `LessonCompletion` | `enrollment`, `lesson`, `completed_at` | `UNIQUE(enrollment, lesson)`. |

Progress is **computed, never stored**. It derives from `completion_rules`,
`LessonCompletion` and the attempt tables, all of which already exist — a stored
percentage would be a second source of truth for something the server already
decides, and the two would drift.

If computing it ever proves too slow, add a column named for what it is
(`progress_percent_cached`, with `progress_computed_at`) and never read it in a
completion decision. Display only.

### Certificate

| Field | Type | Notes |
|---|---|---|
| `user` | FK -> `User`, `PROTECT` | |
| `course_version` | FK -> `CourseVersion`, `PROTECT` | The exact version completed. Never repointed on a new release. |
| `verification_id` | `uuid` | Unique, public, unguessable. Backs the QR/verification URL. |
| `serial_number` | `varchar(64)` | Unique, human-readable. |
| `issued_at` | `datetime` | |
| `expires_at` | `datetime`, nullable | `NULL` means unlimited validity. |
| `status` | enum `VALID` / `EXPIRED` / `REVOKED` | |
| `revoked_at` / `revoked_by` / `revocation_reason` | | Required together when `REVOKED`. |

Constraints:

- `CHECK (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND revoked_by_id IS NOT NULL AND revocation_reason <> ''))`.
- `certificate_one_live_per_version`: `UNIQUE (user_id, course_version_id) WHERE status <> 'REVOKED'`. One live certificate per person per version; a revoked one is kept beside its reissue (`state-machines.md`).

Index: `(course_version_id, status)`.

Revoked certificates are retained and remain publicly verifiable **as revoked**.

---

### Assignment

Attached to the **course**, never to a version. An assignment says a person must
take the training and survives a republication; an `Enrollment` says they are on
one particular version and is replaced when a new one is published
(`state-machines.md`).

| Field | Type | Notes |
|---|---|---|
| `course` | FK -> `Course`, `CASCADE` | |
| `user` | FK -> `User`, `CASCADE`, nullable | Exactly one of `user` / `organization`. |
| `organization` | FK -> `Organization`, `CASCADE`, nullable | Covers whoever is an **active member** when enrolments are reconciled. |
| `requirement` | enum `OPTIONAL` / `REQUIRED` | Default `REQUIRED`. `OPTIONAL` is what makes self-enrolment possible. |
| `due_at` | `datetime`, nullable | `NULL` is legitimate: a required course with no deadline is a normal ask. |
| `assigned_by` | FK -> `User`, `PROTECT` | |
| `is_active` | `boolean`, default `true` | `false` once withdrawn. |
| `withdrawn_at` | `datetime`, nullable | Set exactly when `is_active` is `false` (`assignment_withdrawal_is_consistent`). |

Constraints:

- `CHECK (num_nonnulls(user_id, organization_id) = 1)`
- `assignment_unique_per_user`: `UNIQUE (course_id, user_id) WHERE user_id IS NOT NULL AND is_active`
- `assignment_unique_per_organization`: `UNIQUE (course_id, organization_id) WHERE organization_id IS NOT NULL AND is_active`
- `assignment_withdrawal_is_consistent`

Indexes: `(course_id, is_active)`, `(user_id)`, `(organization_id)`.

A past `due_at` is **allowed**. Back-dating is exactly what somebody does when
recording training that was already overdue, and refusing it would make the
honest record impossible to enter.

Withdrawing an assignment **deactivates** it (`is_active = false`,
`withdrawn_at`) rather than deleting it — who was once required to take what is
a question an audit asks — and **retains the enrolments**.
Progress, attempts and certificates hang off the enrolment, and none of them may
disappear because an obligation was lifted.


### CourseAccessRequest

Somebody in a course's audience asking for a course listed in the catalogue.
**Only Bioeksen decides** (`academy.access_request.decide`, and the decider must
be a member of Bioeksen or one of its departments). Never deleted: a refusal
with its reason is the answer the requester was given.

| Field | Type | Notes |
|---|---|---|
| `course` | FK -> `Course`, `PROTECT` | |
| `requester` | FK -> `User`, `PROTECT` | |
| `note` | `varchar(1000)`, default `''` | The requester's words, for the decider. |
| `status` | enum `PENDING` / `APPROVED` / `REJECTED` / `WITHDRAWN` | See `state-machines.md`. |
| `decided_by` / `decided_at` | FK -> `User`, `PROTECT`, nullable / `datetime`, nullable | Set exactly when `APPROVED` or `REJECTED`. |
| `decision_reason` | `varchar(1000)`, default `''` | Required when `REJECTED`. |
| `assignment_id` | `uuid`, nullable | The `OPTIONAL` assignment an approval created or found. Set exactly when `APPROVED`. |

Constraints:

- `accessrequest_one_pending_per_course`: `UNIQUE (course_id, requester_id) WHERE status = 'PENDING'`
- `accessrequest_decision_is_consistent`, `accessrequest_rejection_has_reason`,
  `accessrequest_not_decided_by_requester`, `accessrequest_assignment_only_when_approved`

### DistributorResponsibility

A Bioeksen employee who answers for one distributor. Routing, not permission:
requests from the distributor and from customers it supplies go to them first.

| Field | Type | Notes |
|---|---|---|
| `distributor` | FK -> `Organization`, `PROTECT` | A `DISTRIBUTOR` (checked in the service). |
| `user` | FK -> `User`, `PROTECT` | A member of Bioeksen or one of its departments (checked in the service). |
| `is_active` / `ended_at` | `boolean` / `datetime`, nullable | Ended, never deleted (`responsibility_end_is_consistent`). |
| `created_by` | FK -> `User`, `PROTECT` | |

Constraint: `responsibility_one_active_per_pair`: `UNIQUE (distributor_id, user_id) WHERE is_active`.

---

## Audit

### AuditEvent

| Field | Type | Notes |
|---|---|---|
| `actor` | FK -> `User`, `PROTECT`, nullable | `NULL` only for system-initiated actions. |
| `actor_email_snapshot` | `varchar(254)` | Denormalised so the trace survives a user rename. |
| `action` | `varchar(128)` | Stable code, e.g. `eifu.document_file.replaced`. |
| `entity_type` / `entity_id` | `varchar(128)` / `varchar(64)` | Loose reference by design: audit outlives schemas. |
| `occurred_at` | `datetime` | |
| `correlation_id` | `uuid` | Joins audit, logs and the originating request. |
| `ip_address` | `inet`, nullable | |
| `previous_state` / `new_state` | JSONB, nullable | Structured change metadata. |
| `reason` | `text`, nullable | Required for actions that `audit-traceability.md` marks as reason-bearing. |

`AuditEvent` is append-only. No `updated_at`, no update path in any service, and
no admin edit form. See `audit-traceability.md`.
