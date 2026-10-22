# Bioeksen Portal — e-IFU

This file gives the decisions and the items of e-IFU. They cover the documents
and their publication, the public lookup, the access records and the
protection of personal data. Read `README.md` first. It explains the IDs, the
decision status and the build order.

## Decisions

Each row is one decision. The **Decision** column gives the rule that is in
force. A *Pending* rule stays in force until the owner answers.

### Documents and resolution

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-060 | Applicability is at the product level. A published document version applies to one product for an applicability period. All catalog numbers of that product get the same IFU. | Pending | QA | questions.md 9 | IFU-30, IFU-60 | adr/0005; adr/0012 §Each format has its own IFU; audit D-5 |
| DEC-061 | A lookup resolves the document version from the product, the manufacturing date of the LOT and the applicability periods of the published versions. A lookup never selects a version because it is the newest. A period is half-open: `effectiveFrom` is inside it and `effectiveTo` is not. When no period contains the date, the lookup gives no document. It never gives another version as a fallback. | Decided | PO | — | IFU-30, IFU-60 | eng/eifu-resolution-specification.md §The rule |
| DEC-062 | A lookup can still resolve a `SUPERSEDED` version for the LOTs of its own period. A lookup never resolves a `DRAFT` or `WITHDRAWN` version. | Decided | PO | — | IFU-10, IFU-30, IFU-60 | eng/eifu-resolution-specification.md §documents_documentversion |
| DEC-063 | Bioeksen's quality system approves each IFU before it reaches the portal. The portal is not an approval system: one holder of `eifu.document.publish` publishes a version. | Decided | PO | — | IFU-30 | eng/project-overview.md §6 |
| DEC-064 | A withdrawal leaves its period without a document, unless the person who withdraws the version asks to reopen the previous version. The system never guesses which of the two is right. | Default | ENG | — | IFU-31 | eng/state-machines.md §What happens to the period; ops/incidents.md |
| DEC-065 | The correction of a wrong file of a published version is a replacement with a reason. The old file row and its stored object stay. The replacement keeps the language of the old file. | Decided | PO | — | IFU-32 | eng/project-overview.md §6 |
| DEC-066 | An override binds one LOT to one `PUBLISHED` or `SUPERSEDED` version of the product of that LOT, with a reason. Only an override bypasses the manufacturing date. | Decided | PO | — | IFU-40, IFU-60 | eng/project-overview.md §5 |
| DEC-067 | A lookup does not resolve a LOT with a date conflict, also when the LOT has an active override. | Pending | QA | questions.md 10 | IFU-60 | eng/eifu-resolution-specification.md §A date conflict blocks an override |
| DEC-068 | A LOT that was made before the first applicability period of its product gets the outcome `NO_APPLICABLE_VERSION`. Any other date without a period gets the same outcome. | Pending | PO | questions.md 11 | IFU-60, IFU-70 | eng/deferred-work.md §3 |
| DEC-069 | A lookup returns every language file of the resolved version, sorted by the language code. The system never puts one language in place of another. A language code is a BCP 47 tag of up to 35 characters. The interface languages do not limit the language codes. | Decided | PO | — | IFU-20, IFU-60 | eng/localization.md §e-IFU languages; RFC 5646 §4.4.1 |
| DEC-092 | The browser sends a document file to `POST /api/v1/eifu/document-versions/{id}/files` and to the replacement endpoint with `fetch`, as `multipart/form-data` with the limit of IFU-20 rule 2. A server action does not take a document file. | Default | ENG | — | IFU-20, IFU-32 | B3 contract; owner answer 2026-10-22 |
| DEC-093 | `GET /api/v1/eifu/document-files/{id}/download-url` gives a signed URL of DEC-076 to a holder of `eifu.document.view`, after the check of that permission (DEC-125). | Default | ENG | — | IFU-20 | B3 contract; owner answer 2026-10-22 |
| DEC-094 | The page of a LOT in the backoffice is `/backoffice/catalog/lots/{id}`. The list of the overrides is `/backoffice/lot-overrides`, with `eifu.document.view`. | Default | ENG | — | IFU-40 | B3 contract; owner answer 2026-10-22 |
| DEC-095 | The version page is `/backoffice/documents/{documentId}/versions/{versionId}`. | Default | ENG | — | IFU-10 | B3 contract; owner answer 2026-10-22 |
| DEC-096 | The trigger `product_identity_is_settled` on `catalog_product` refuses a change of the stem or the regulatory status while an `eifu_document` names the product. The migration of the eifu module creates it, so that the catalog module never imports the eifu module (DEC-004). The catalog service maps the refusal to 409 `RES-4302`. | Default | ENG | — | IFU-10, CAT-10 | B3 contract; owner answer 2026-10-22 |

### The public lookup

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-070 | The public lookup has two steps. The verification takes the catalog number, the LOT number, the email address and the consent. It sends a six-digit verification code to the email address. The lookup takes the verification id and the verification code, and nothing else. The verification never says whether the catalog number or the LOT exists. | Decided | PO | — | IFU-50, IFU-51, IFU-60 | adr/0018 (decided 2026-09-07); audit D-3 |
| DEC-071 | A verification code is valid for 10 minutes. It works only one time. The fifth wrong code ends the verification. The system stores the code only as a keyed hash. | Default | ENG | — | IFU-51 | eng/notifications.md §Rules 4; eng/error-codes.md |
| DEC-072 | Each email address gets at most 3 verifications in 10 minutes and at most 10 verifications in a day. Each source address gets at most 20 verifications in an hour and at most 30 lookups in 10 minutes. A request that is over a limit gets 429 `RATE-4400` with `Retry-After`. | Default | ENG | — | IFU-50, IFU-51 | ops/incidents.md §The SMTP relay is down |
| DEC-073 | A lookup with a correct verification code answers 200 with an `outcome`, also when it finds no document. The outcome is the result of the lookup, and the access record stores it. The system uses the error envelope only for a fault of the request. This rule departs from `sds-api-design` (`app-endpoints.md`, **Methods**: 201 when a POST creates anything). The reason is that the access record is not a member that the caller can address. The departure ends when SDS answers. | Pending | SDS | questions.md 2 | IFU-60, IFU-70 | eng/eifu-resolution-specification.md §Outcomes; adr/0014; audit D-7 |
| DEC-074 | The legal function writes the consent text. Until then, the page shows the full current draft at the place where the visitor gives consent. The page marks this text as a draft. The dictionaries hold the consent text. Its version is `EIFU_LEGAL_NOTICE_VERSION`. Each change of the text changes the version. | Pending | LEG | questions.md 12 | IFU-50, IFU-70 | adr/0018 §3; eng/privacy-data-residency.md §Consent and notice |
| DEC-087 | Consent is an explicit act. The system never ticks the consent box in advance. The system never combines the consent with a consent to marketing. | Decided | PO | — | IFU-50, IFU-70 | eng/privacy-data-residency.md §Consent and notice |
| DEC-075 | The lookup page is at the path `/eifu` of the production host. The path never changes after it is printed on a package. A move of the page needs a permanent redirect that stays. | Pending | PO | questions.md 13 | IFU-70 | eng/eifu-domain.md §The public address |
| DEC-076 | A download link is a signed storage URL that works for 5 minutes. The file downloads as an attachment with the name `{documentNumber}-rev{revisionLabel}-{languageCode}.pdf`. It never has the original file name of the upload. | Default | ENG | — | IFU-60 | eng/eifu-resolution-specification.md; eng/object-storage.md; audit D-3 |
| DEC-077 | The public lookup collects no first name and no last name. | Default | ENG | — | IFU-50, IFU-51 | adr/0018 §1; eng/privacy-data-residency.md §Data minimisation; audit D-3 |

### Access records and personal data

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-078 | Each lookup with a correct verification code writes one access record, for all outcomes. A request that fails validation writes no access record. A verification that never gets its correct code writes no access record. | Decided | PO | — | IFU-80 | eng/eifu-resolution-specification.md §Access recording |
| DEC-091 | An access record has no language and no action. It has no language because a lookup gives the links of all languages at one time. It has no action because the download goes from the browser to the store. | Default | ENG | — | IFU-80 | eng/data-model-fields.md §EIFUAccessRecord (`language_code`, `action` not carried over) |
| DEC-079 | The lawful basis of the access record is both explicit consent and IVDR traceability. The identity of the person is necessary. | Decided | PO | questions.md 14 | IFU-80, IFU-90 | adr/0017 §Outstanding legal questions (answered 2026-09-07) |
| DEC-080 | The identity fields of an access record stay for ten years. The system counts ten years as 3,653 days. Then the system anonymizes the identity fields: it clears them and stamps the time. The configuration value `EIFU_ACCESS_RECORD_RETENTION_DAYS` gives the period (default `3653`; `0` stops the pass). The system never deletes the row. | Decided | PO | questions.md 15 | IFU-81, FND-03 | adr/0018 §2; adr/0016; adr/0007; audit D-1 |
| DEC-081 | The system encrypts the email address and the client address of a public lookup at rest, with AES-256-GCM and a key ring. A keyed hash of the email address lets an erasure find the access records of a person. The system reads an identity only through one audited path. | Decided | PO | — | IFU-50, IFU-90, IFU-91 | adr/0017 |
| DEC-082 | An administrator erases the identity of a person from the access records when the person asks. Before the erasure, the identity of the person is checked outside the system. There is no self-service path. The administrator does each erasure completely. | Pending | LEG | questions.md 14 | IFU-82 | adr/0016 §3; adr/0017 §Outstanding legal questions |
| DEC-083 | Two named custodians keep the identity key ring, the lookup pepper and the backup identity. They keep these items away from the host, and never in the same place as the backups. | Pending | IT | questions.md 16 | IFU-90, PLT-60 | adr/0017; ops/backup-restore.md §Key escrow; audit D-1 |
| DEC-088 | A key leaves the key ring only when no row names it. The escrowed copy of the key stays until all backups that were made before the removal of the key expire. | Default | ENG | — | IFU-90 | ops/incidents.md §Rotating the identity key; audit D-1 |
| DEC-089 | The lookup pepper never changes. With a new pepper, all lookup hashes that exist become useless, and an erasure finds nothing. | Default | ENG | — | IFU-90 | adr/0017 item 5 |
| DEC-090 | The first key of the key ring is replaced one time each year. If an exposure of that key is possible, it is replaced immediately. | Default | ENG | — | IFU-90 | ops/incidents.md §Rotating the identity key |
| DEC-084 | Release 1 does not collect page views or clicks. The lookup report reads only the access records. It shows aggregates. | Pending | PO | questions.md 17 | IFU-83 | eng/analytics.md §Product usage |
| DEC-085 | Aggregates of the access records need `eifu.access_record.view_aggregated`. Single access records need `eifu.access_record.view_raw`. They show no identity. An identity needs the audited read of IFU-91. | Default | ENG | — | IFU-83, IFU-84, IFU-91 | eng/analytics.md §Access rules |

## The resolution model

```
Lookup input ─▶ Catalog number ─▶ LOT (manufacturing date)
                      │
                      ▼
                   Product ─▶ Applicability periods ─▶ Document version ─▶ Files
                                [from, to)              PUBLISHED or SUPERSEDED
```

An applicability period exists only for a published fact. Publication creates
the period. A draft never reserves a period. The exclusion constraint on the
periods prevents an overlap of two live periods of one product. As a result, a
date reaches one version or none. In these files, "the version `03`" is the
document version with the revision label `03`.

## Documents and publication

The module `eifu` keeps the documents, their versions, their files, the
applicability periods and the overrides. In the acceptance criteria, "fails"
means that the system refuses the action with the error code that the
criterion names, and no row changes.

### IFU-10 Documents and versions

**What.** The register of the IFU documents and their versions.

**Rules.**
1. A document is an IFU (DEC-002, DEC-120) with a document number from
   Bioeksen's quality system. The document number is unique in the portal.
   The title of the document follows DEC-011.
2. A document names its product when a person creates it. A person can change
   the product only until the first publication of a version of the document.
3. A version has a revision label that is unique in its document. A new
   version is `DRAFT`. A draft can hold a proposed start date, which no lookup
   reads (DEC-062).
4. A field of a version changes only while the version is `DRAFT`.
5. The stem and the regulatory status of a product change only while no
   document names the product (CAT-10, DEC-096).
6. The system never deletes a document or a version (DEC-010).
7. A person needs `eifu.document.view` to see documents. A person needs
   `eifu.document.manage` to create documents and versions. The system audits
   each creation and each change (PLT-40).

**States.**

| State | TR | Owner |
|---|---|---|
| `DRAFT` | *Taslak* | a holder of `eifu.document.manage` |
| `PUBLISHED` | *Yayında* | a holder of `eifu.document.withdraw` |
| `SUPERSEDED` | *Yerine yenisi geçti* | a holder of `eifu.document.withdraw` |
| `WITHDRAWN` | *Geri çekildi* | nobody |

**Moves.** If a check fails, the move fails.

| # | From | Move | To | Who | Checks |
|---|---|---|---|---|---|
| 1 | none | *Oluştur* (create) | `DRAFT` | a holder of `eifu.document.manage` | the revision label is unique in the document |
| 2 | `DRAFT` | *Yayınla* (publish) | `PUBLISHED` | a holder of `eifu.document.publish` | IFU-30 |
| 3 | `PUBLISHED` | a later move 2 for the same product | `SUPERSEDED` | the system | the later period starts after this period |
| 4 | `PUBLISHED` | *Geri çek* (withdraw) | `WITHDRAWN` | a holder of `eifu.document.withdraw` | a reason; IFU-31 |
| 5 | `SUPERSEDED` | *Geri çek* (withdraw) | `WITHDRAWN` | a holder of `eifu.document.withdraw` | a reason; IFU-31 |
| 6 | `SUPERSEDED` | move 4 of the next version, with reopen | `PUBLISHED` | the system | IFU-31 |

**Data.** `eifu_document`: `document_number` (unique,
`document_number_unique`), `document_type` (`IFU`), `title` (JSONB),
`product` (restrict on delete). The trigger `document_product_is_settled`
refuses a change of the product after the publication of a version of the
document. `eifu_document_version`: `document`, `revision` (the revision
label, up to 16 characters), `status`, `proposed_effective_from`
(optional), `published_at`, `published_by`, `superseded_at`, `withdrawn_at`,
`withdrawn_by`, `withdrawal_reason`. The constraint
`document_version_unique_revision` is `UNIQUE (document_id, revision)`.

**Screens.** Backoffice › Documents:
- the list of documents by product;
- the document page with its versions, their states and their periods;
- the version page with its files and the actions of the moves (DEC-095).

**Acceptance.**
- **AC1.** When an IFU Manager creates a document with the document number
  `KTL-0042`, a title in both languages and a product, the document exists.
  One `AUDIT` record names it.
- **AC2.** If a document with the same document number exists, the creation
  fails with 409 `RES-4300`.
- **AC3.** When an IFU Manager creates the version `03` of a document, the
  version is `DRAFT`. If the document has a version `03`, the creation fails
  with 409 `RES-4300`.
- **AC4.** When a person changes the product of a document with no published
  version, the change succeeds. If a version of the document was published,
  the change fails with 409 `RES-4302`.
- **AC5.** When a person changes the proposed start date of a `DRAFT`
  version, the change succeeds.
- **AC6.** If a person changes a field of a version that is not `DRAFT`, the
  change fails with 409 `RES-4302`.
- **AC7.** A draft of one document has the proposed start date 2026-02-01.
  When a person publishes a version of another document of the same product
  with that start date, the publication succeeds.
- **AC8.** If a person changes the stem of a product that a document names,
  the change fails with 409 `RES-4302`.

**Trace.** eng/data-model-fields.md §Document, §DocumentVersion; eng/state-machines.md §DocumentVersion

### IFU-20 Document files

**What.** The PDF files of a document version, one for each language.

**Rules.**
1. A person uploads a file through
   `POST /api/v1/eifu/document-versions/{id}/files` (multipart, with
   `languageCode` and one file; DEC-092). A manager downloads a file as
   DEC-093 says. A person can upload a file only to a `DRAFT`
   version. A published version changes its files only through IFU-32.
2. The body limit of this endpoint is 20 MiB (20,971,520 bytes). This limit is
   recorded, as `sds-api-design` requires. The server reads the file type from
   the bytes. It accepts only PDF.
3. The server calculates the SHA-256 hash of the file. When the request
   declares a hash, the two hashes must be equal.
4. A version has at most one active file for each language. The language code
   follows DEC-069.
5. The system stores the file as PLT-10 and DEC-032 say. The system keeps the
   name of the uploaded file only as information.
6. On a `DRAFT` version, a person removes a file by deactivation. The system
   deletes no file row (DEC-010).
7. The system audits each upload and each deactivation (PLT-40).

**Data.** `eifu_document_file`: `document_version`, `language_code` (up to 35
characters), `storage_key`, `file_hash` (64 hex characters),
`file_size_bytes`, `content_type`, `original_filename`, `is_active`.
The constraint `document_file_one_active_per_language` is a unique index on
`(document_version_id, language_code)` where `is_active`.

**Acceptance.**
- **AC1.** When an IFU Manager uploads a Turkish PDF to a `DRAFT` version, the
  version has an active `tr` file. The file has the hash that the server
  calculated, its size and the type `application/pdf`. One `AUDIT` record
  names it.
- **AC2.** If the bytes are not a PDF, the upload fails with 400 `VAL-4006`,
  and `details` names the field `file`. This is also true when the file name
  is `file.pdf`.
- **AC3.** If the request body is larger than 20 MiB, the upload fails with
  413 `VAL-4550`.
- **AC4.** If the version has an active `tr` file, a second `tr` upload fails
  with 409 `RES-4300`.
- **AC5.** If the version is not `DRAFT`, the upload fails with 409
  `RES-4302`.
- **AC6.** When the language code is `de` or `sr-Latn-RS`, the upload
  succeeds. If the language code is not a BCP 47 tag, the upload fails with
  400 `VAL-4006`.
- **AC7.** If the request declares a hash that is different from the hash that
  the server calculates, the upload fails with 400 `VAL-4006`. The system
  stores nothing.
- **AC8.** If the file has no bytes, the upload fails with 400 `VAL-4006`.
- **AC9.** When an IFU Manager deactivates the `tr` file of a `DRAFT` version,
  the row stays with `isActive` false. Then an upload of a new `tr` file
  succeeds.

**Trace.** eng/object-storage.md §Upload validation; eng/data-model-fields.md §DocumentFile

### IFU-30 Publication and periods

**What.** Publication opens an applicability period for the product and closes
the period before it.

**Rules.**
1. The applicability periods follow DEC-060, DEC-061 and DEC-062. The portal
   does not approve content (DEC-063). The dates of a period are business
   dates (DEC-012, DEC-039).
2. The publish request names the start date `effectiveFrom` and the product
   that the publisher saw (`expectedProductId`).
3. Publication runs in one transaction, in this order:
   1. It refuses a version that is not `DRAFT`.
   2. It refuses a version that has no active file.
   3. It locks the document. It refuses when the product of the document is
      not `expectedProductId`.
   4. It locks the live periods of the product. Then:
      - When an open period (no `effectiveTo`) exists, it refuses an
        `effectiveFrom` on or before the `effectiveFrom` of the open period.
        For a later `effectiveFrom`, it sets the `effectiveTo` of the open
        period to the new `effectiveFrom`. It also moves the version of that
        period from `PUBLISHED` to `SUPERSEDED`.
      - When no open period exists, it refuses an `effectiveFrom` before the
        latest `effectiveTo` of the live periods.
   5. It creates the new period with no `effectiveTo`.
   6. It moves the version to `PUBLISHED`, and stores the time and the
      publisher.
   7. It writes the `AUDIT` record (DEC-014).
4. A refusal uses the error codes of DEC-013.
5. The database holds the periods with the constraints below. The system never
   deletes a period (DEC-010).

**Data.** `eifu_applicability`: `document_version`, `product`,
`effective_from` (date), `effective_to` (date, optional), `withdrawn_at`
(optional). The constraints are:
- `applicability_period_is_ordered`:
  `CHECK (effective_to IS NULL OR effective_to > effective_from)`;
- `applicability_no_overlap_per_product`:
  `EXCLUDE USING gist (product_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&) WHERE (withdrawn_at IS NULL)`,
  which needs the extension `btree_gist`;
- `applicability_on_document_product`: a trigger that refuses a period whose
  product is not the product of its document.

The index `applicability_lookup_idx` is on `(product_id, effective_from)`.

**Acceptance.**
- **AC1.** When an IFU Manager publishes the first version of a product with
  the start 2024-01-01, the version is `PUBLISHED`. Its period starts at
  2024-01-01 and has no end. One `AUDIT` record names the move.
- **AC2.** When an IFU Manager publishes the next version with the start
  2025-01-01, the first version is `SUPERSEDED`. Its period ends at
  2025-01-01. The new period starts at 2025-01-01 and has no end.
- **AC3.** If the start is on or before the start of the open period, the
  publication fails with 400 `VAL-4006`. Its `details` names the field
  `effectiveFrom`.
- **AC4.** If the version has no active file, the publication fails with 409
  `RES-4302`.
- **AC5.** If the version is not `DRAFT`, the publication fails with 409
  `RES-4302`.
- **AC6.** If `expectedProductId` is not the product of the document, the
  publication fails with 409 `RES-4301`.
- **AC7.** If a statement writes a second live period of the same product
  that overlaps a live period, the database refuses it.
- **AC8.** The version that held the open period from 2026-01-01 was
  withdrawn without reopen, and the live periods end at 2026-01-01. After
  this, a publication with the start 2025-06-01 fails with 400 `VAL-4006`. A
  publication with the start 2026-01-01 succeeds.

**Trace.** eng/eifu-resolution-specification.md §Publication; eng/data-model-fields.md §DocumentApplicability; audit D-9

### IFU-31 Withdrawal

**Acceptance.**
- **AC1.** When a holder of `eifu.document.withdraw` withdraws the version
  that holds the open period, with a reason and without reopen, the version
  is `WITHDRAWN`. Its period stays with `withdrawnAt` set. No other period
  changes (DEC-064). One `AUDIT` record holds the reason.
- **AC2.** When the same withdrawal asks to reopen, the period that ended at
  the start of this period loses its end. The version of that period is
  `PUBLISHED` again. The `AUDIT` record names the reopened version.
- **AC3.** If a withdrawal asks to reopen and the version holds no open
  period, the withdrawal fails with 409 `RES-4302`.
- **AC4.** If a withdrawal has no reason, it fails with 400 `VAL-4001`.
- **AC5.** When a person withdraws a `SUPERSEDED` version, its period gets
  `withdrawnAt`. No other period changes.

### IFU-32 Published-file replacement

**Acceptance.**
- **AC1.** When a holder of `eifu.document.replace_published_file` replaces
  the `tr` file of a `PUBLISHED` or `SUPERSEDED` version with a reason and a
  new PDF:
  - the new file is active;
  - the old file row stays with `isActive` false, and its stored object stays
    (DEC-124);
  - a replacement row holds both hashes, the actor, the time and the reason
    (DEC-065);
  - one `AUDIT` record names the replacement.
- **AC2.** If the new file has the same bytes as the old file, the
  replacement fails with 400 `VAL-4006`.
- **AC3.** If the replacement has no reason, it fails with 400 `VAL-4001`.
- **AC4.** If the request has a `languageCode`, the replacement fails with
  400 `VAL-4007`. The replacement keeps the language of the old file.
- **AC5.** If the version is `DRAFT` or `WITHDRAWN`, the replacement fails
  with 409 `RES-4302`.

**Data.** `eifu_file_replacement`: `document_version`, `language_code`,
`previous_file`, `replacement_file`, `previous_file_hash`,
`replacement_file_hash`, `replaced_by`, `replaced_at`, `reason` (required).
The constraint `file_replacement_reason_is_present` is
`CHECK (btrim(reason) <> '')`. The storage key of the new file follows
DEC-032. The system never deletes a replacement row (DEC-010).

### IFU-40 LOT overrides

**What.** A controlled exception that sends one LOT to one version.

**Rules.**
1. An override follows DEC-066. It needs `eifu.lot_override.manage` and a
   reason.
2. A LOT has at most one active override.
3. An override ends by deactivation, with a reason. The row stays (DEC-010).
4. The system audits each creation and each end (DEC-014, PLT-40).
5. When a person later withdraws the target version, the lookup reports this
   (IFU-60).

**Data.** `eifu_lot_override`: `lot`, `document_version`, `reason`
(required), `created_by`, `is_active`, `ended_by`, `ended_at`, `end_reason`.
The constraints are `lot_override_reason_is_present`:
`CHECK (btrim(reason) <> '')`; and `lot_override_one_active_per_lot`: a
unique index on `lot_id` where `is_active`.

**Screens.** The page of the LOT in the backoffice shows its active override
and the history of its overrides. It has the form to create or end an
override. The paths follow DEC-094.

**Acceptance.**
- **AC1.** When an IFU Manager creates an override with a reason, from a LOT
  to a `SUPERSEDED` version of the LOT's product, the override is active. One `AUDIT` record names it.
- **AC2.** If the target version is `DRAFT` or `WITHDRAWN`, the creation fails
  with 400 `VAL-4006`, and `details` names the field `documentVersionId`.
- **AC3.** If the target version belongs to a document of another product,
  the creation fails with 400 `VAL-4006`.
- **AC4.** If the LOT has an active override, a second creation fails with 409
  `RES-4300`.
- **AC5.** If the creation has no reason, it fails with 400 `VAL-4001`.
- **AC6.** When an override ends with a reason, the row stays with `isActive`
  false. One `AUDIT` record holds the reason.
- **AC7.** If the end of an override has no reason, it fails with 400
  `VAL-4001`.

**Trace.** eng/state-machines.md §LotDocumentOverride; eng/deferred-work.md §1.1

## The public lookup

A visitor with no account proves an email address in the verification, and
then gets the files of the correct version in the lookup. Both steps need no
session, and they never write a product, a catalog number or a LOT. Rate
limits apply to both steps (DEC-072). In the acceptance criteria, "fails"
means that the system answers with the error code that the criterion names,
and gives no document. A lookup with an outcome other than `RESOLVED` does
not fail. It answers with its outcome.

The tests read the verification code from the fake mail transport of FND-03.

### IFU-50 Verification

**What.** The first step of the public lookup: the system takes the inputs and
the consent, and sends a verification code.

**Rules.**
1. `POST /api/v1/eifu/verifications` takes `catalogNumber`, `lotNumber`,
   `email`, `noticeVersion` and `noticeAccepted` (DEC-070, DEC-077).
2. `catalogNumber` and `lotNumber` have 1 to 64 characters after transport
   cleanup (CAT-30). `email` is an email address of at most 254 characters.
   `noticeVersion` is the current `EIFU_LEGAL_NOTICE_VERSION` (DEC-074).
   `noticeAccepted` is `true` (DEC-087).
3. The answer is 201 with `Location`. Its body has `id` (a UUID, DEC-121) and
   `expiresAt`. The answer is the same whether or not the catalog number or
   the LOT exists.
4. After the commit, the system sends the code mail (PLT-20, DEC-033). If the
   system cannot send it, nobody can use the verification after that. The
   answer has the error code of the failure:
   - `UP-5500` when the relay does not answer;
   - `UP-5501` when a timeout occurs at the relay;
   - `UP-5000` when the relay refuses the message.
5. `GET /api/v1/eifu/verifications/{id}` gives `id`, `expiresAt` and
   `attemptsRemaining`. An unknown id gives 404 `RES-4200`.
6. A verification is not a controlled record. PLT-30 removes a verification
   24 hours after it ends. A verification ends when one of these occurs:
   - a lookup uses it;
   - its fifth wrong code arrives;
   - it expires;
   - the system cannot send its code mail.
7. The verification keeps the inputs as the visitor typed them, the consent
   text version, the email address and its lookup hash. It also keeps the
   client address (DEC-038) and the user agent. The system encrypts the email
   address and the client address (DEC-081, IFU-90).
8. The rate limits follow DEC-072. Redis keeps the counters (DEC-007).
9. A fault of the request uses the error codes of DEC-013.

**Data.** `eifu_verification`: `public_id` (UUID, unique),
`catalog_number_input`, `lot_number_input`, `notice_version`, `email`
(encrypted), `email_lookup_hash`, `client_address` (encrypted),
`identity_key_id`, `user_agent`, `code_hash`, `attempts_used`, `expires_at`,
`used_at`, `ended_at`, `send_failed_at`.

**Acceptance.**
- **AC1.** When a visitor sends a valid request, the answer is 201. It has a
  `Location`, an `id` in UUID form and an `expiresAt` 10 minutes later. One
  mail with a six-digit verification code goes to the email address.
- **AC2.** When the system sends the code mail, the mail holds the
  verification code, the catalog number and the LOT number of the request.
  The mail is in Turkish and English, and has no link.
- **AC3.** When the catalog number does not exist, the answer has the same
  status and the same fields as for a catalog number that exists. The system
  sends a code mail. The system creates no product, no catalog number and no
  LOT.
- **AC4.** If `noticeAccepted` is `false`, the request fails with 400
  `VAL-4006`, and `details` names the field `noticeAccepted`. The system
  sends no mail.
- **AC5.** If `noticeVersion` is not the current version, the request fails
  with 400 `VAL-4006`, and `details` names the field `noticeVersion`.
- **AC6.** If the request has no `email`, it fails with 400 `VAL-4001`.
- **AC7.** When the 4th request for one email address arrives within 10
  minutes, the answer is 429 `RATE-4400` with `Retry-After`. The system sends
  no mail.
- **AC8.** When the 11th request for one email address arrives within one
  day, the answer is 429 `RATE-4400`.
- **AC9.** When the 21st request from one source address arrives within an
  hour, the answer is 429 `RATE-4400`.
- **AC10.** If the mail relay does not answer, the request fails with 503
  `UP-5500`. If the relay refuses the message, the request fails with 500
  `UP-5000`.
- **AC11.** When the system stores a verification, its email column does not
  hold the email address in plain text.
- **AC12.** When a visitor reads a verification with
  `GET /api/v1/eifu/verifications/{id}`, the answer holds `id`, `expiresAt`
  and `attemptsRemaining` 5. If the id is unknown, the answer is 404
  `RES-4200`.
- **AC13.** When a verification ended more than 24 hours before a pass of
  PLT-30, the pass removes it.

**Trace.** adr/0018; eng/eifu-resolution-specification.md §Inputs and outputs; eng/notifications.md §Rules 4

### IFU-51 Code entry

**Acceptance.** These criteria use `POST /api/v1/eifu/lookups` with the body
fields `verificationId` and `code` (IFU-60).
- **AC1.** When the visitor sends the correct code within 10 minutes, the
  lookup runs and uses the verification.
- **AC2.** If a lookup names a used verification, it fails with 409
  `RES-4302`.
- **AC3.** If the code is wrong, the lookup fails with 400 `VAL-4006`, from
  the first to the fifth wrong code. `details` names the field `code`.
  `attemptsRemaining` decreases by one.
- **AC4.** If a lookup sends the correct code after the fifth wrong code, it
  fails with 409 `RES-4302` (DEC-071).
- **AC5.** If the correct code arrives more than 10 minutes after the
  verification, the lookup fails with 409 `RES-4302`.
- **AC6.** If the verification id is unknown, the lookup fails with 400
  `VAL-4006`, and `details` names the field `verificationId`.
- **AC7.** If the code mail of the verification failed, a lookup with that
  verification fails with 409 `RES-4302`.
- **AC8.** When two lookups with the correct code arrive at the same time,
  exactly one gets a result. The other lookup fails with 409 `RES-4302`.
- **AC9.** If the body has a field other than `verificationId` and `code`, for
  example `firstName`, the lookup fails with 400 `VAL-4007`.
- **AC10.** When the 31st lookup from one source address arrives within 10
  minutes, the answer is 429 `RATE-4400`.

### IFU-60 Resolution

**What.** The second step of the public lookup: the system checks the
verification code, and finds the correct document version and its files.

**Rules.**
1. `POST /api/v1/eifu/lookups` runs after IFU-51 accepts the code (DEC-070).
   It does not change the catalog or the documents. It writes the access
   record (IFU-80).
2. The resolution follows DEC-060, DEC-061, DEC-062, DEC-045, DEC-046,
   DEC-067 and DEC-069, in this order:
   1. Clean the stored inputs (CAT-30).
   2. Find the catalog number with an exact match. If there is none, the
      outcome is `CATALOG_NUMBER_NOT_FOUND`. This step also finds a
      deactivated catalog number.
   3. Find the LOT of that catalog number with an exact match. The letter case
      stays as typed.
   4. If there is no LOT and a LOT with that LOT number exists under another
      catalog number, the outcome is `LOT_CATALOG_MISMATCH`. Otherwise, if
      there is no LOT, the outcome is `LOT_NOT_FOUND`.
   5. If the LOT has a date conflict, the outcome is `LOT_DATE_CONFLICT`.
   6. If the LOT has an active override (DEC-066):
      - if the version of the override is not `PUBLISHED` or `SUPERSEDED`,
        the outcome is `OVERRIDE_TARGET_NOT_PUBLISHED`;
      - if that version has no active file, the outcome is
        `NO_FILE_FOR_VERSION`;
      - otherwise, the outcome is `RESOLVED` with `resolvedViaOverride` true.
   7. Find the live periods of the product that contain the manufacturing
      date and have a `PUBLISHED` or `SUPERSEDED` version. Use a limit of 2
      rows. If there is no period, the outcome is `NO_APPLICABLE_VERSION`
      (DEC-068). If there are two periods, the outcome is
      `AMBIGUOUS_APPLICABILITY`.
   8. If the version has no active file, the outcome is
      `NO_FILE_FOR_VERSION`. Otherwise, the outcome is `RESOLVED`.
3. The resolution never sorts by revision label, version, date or id. It never
   gives another version as a fallback.
4. The answer follows DEC-073: 200, `status` `ok`, `outcome`, and the cleaned
   `catalogNumber` and `lotNumber`. When the resolution finds the LOT, the
   answer also has `manufacturingDate` (DEC-039). A `RESOLVED` answer also has
   `productName`, `documentNumber`, `documentTitle`, `revision` (the revision
   label), `resolvedViaOverride` and `files`.
5. Each file has `languageCode`, `contentType`, `fileSizeBytes`, `fileHash`
   and `downloadUrl` (DEC-076, DEC-125, DEC-132). The answer never holds a row id, a
   storage key, a file name or an `isActive` flag.

**Acceptance.** These criteria use this fixture:
- the product `BS-GHPV-L` (`IVD`) and its catalog number `BS-GHPV-L-100`;
- the document `KTL-0042` with three published versions:
  - `01` from 2024-01-01 to 2025-01-01 (`SUPERSEDED`);
  - `02` from 2025-01-01 to 2026-01-01 (`SUPERSEDED`);
  - `03` from 2026-01-01 with no end (`PUBLISHED`);
- active `tr` and `en` files for each version.

"A LOT of date D" is a LOT of `BS-GHPV-L-100` whose LOT number encodes D.
Each lookup follows IFU-50 and IFU-51.
- **AC1.** When the lookup names a LOT of 2026-03-09, the answer is 200 with
  `RESOLVED` and `revision` `03`. It also has the manufacturing date
  `2026-03-09`, the name of `BS-GHPV-L` and `resolvedViaOverride` false.
- **AC2.** When the lookup names a LOT of 2024-06-15, the answer has
  `revision` `01`, and not `revision` `03`.
- **AC3.** When the lookup names a LOT of 2023-01-01, the outcome is
  `NO_APPLICABLE_VERSION`, and the answer has no `revision` and no `files`.
- **AC4.** When a `DRAFT` version `04` with the proposed start 2026-02-01
  exists, a LOT of 2026-03-09 still gets the version `03`.
- **AC5.** When a person withdraws the version `01`, a LOT of 2024-06-15 gets
  `NO_APPLICABLE_VERSION`, and no other version.
- **AC6.** When the version `03` has `tr`, `en` and `de` files, the files of
  the answer are in the order `de`, `en`, `tr`. Each file has `languageCode`,
  `contentType` `application/pdf`, `fileSizeBytes`, `fileHash` and
  `downloadUrl`, and no id, storage key or file name.
- **AC7.** When a person replaces the `tr` file of the version `03`, the
  answer holds the new hash and not the old hash.
- **AC8.** When the version `03` has no active file, a LOT of 2026-03-09 gets
  `NO_FILE_FOR_VERSION`.
- **AC9.** When a LOT of 2026-03-09 has an active override to the version
  `01`, the answer has `revision` `01` and `resolvedViaOverride` true.
- **AC10.** When that override ends, the answer has `revision` `03` and
  `resolvedViaOverride` false.
- **AC11.** When a person withdraws the target version of an active override,
  the outcome is `OVERRIDE_TARGET_NOT_PUBLISHED`.
- **AC12.** When a LOT has a date conflict and an active override, the
  outcome is `LOT_DATE_CONFLICT`.
- **AC13.** When the answer gives a `downloadUrl`, the URL works for 5
  minutes. After 5 minutes, the URL does not work. The file downloads as an
  attachment with the name `KTL-0042-rev03-tr.pdf`.

**Trace.** eng/eifu-resolution-specification.md §The resolution algorithm, §Acceptance tests (fixture product per adr/0012); audit D-3, D-5

### IFU-61 Period boundaries

**Acceptance.** These criteria use the fixture of IFU-60.
- **AC1.** A LOT of 2024-01-01 gets the version `01`.
- **AC2.** A LOT of 2024-12-31 gets the version `01`.
- **AC3.** A LOT of 2025-01-01 gets the version `02`.
- **AC4.** A LOT of 2025-12-31 gets the version `02`.
- **AC5.** A LOT of 2026-01-01 gets the version `03`.
- **AC6.** A LOT of 2030-06-01 gets the version `03`.

### IFU-62 Lookup outcomes

**Acceptance.** These criteria use the fixture of IFU-60.
- **AC1.** When the catalog number is unknown, the outcome is
  `CATALOG_NUMBER_NOT_FOUND`.
- **AC2.** When the catalog number is known and the LOT number is unknown, the
  outcome is `LOT_NOT_FOUND`.
- **AC3.** When the LOT exists under another catalog number, the outcome is
  `LOT_CATALOG_MISMATCH`.
- **AC4.** When the LOT has a date conflict, the outcome is
  `LOT_DATE_CONFLICT`.
- **AC5.** When the inputs are `"  BS-GHPV-L-100  "` and
  `" B2603091224GHPVV "` for a registered LOT `B2603091224GHPVV`, the outcome
  is `RESOLVED`.
- **AC6.** When the input is `b2603091224ghpvv` for a LOT stored as
  `B2603091224GHPVV`, the outcome is `LOT_NOT_FOUND`.
- **AC7.** When lookups name an unknown catalog number and an unknown LOT, the
  numbers of products, catalog numbers and LOTs do not change.
- **AC8.** When the catalog number is deactivated, the outcome is `RESOLVED`.
- **AC9.** When the outcome is not `RESOLVED`, the HTTP status is 200 and the
  body `status` is `ok`.
- **AC10.** When the product is deactivated, the outcome is `RESOLVED`.
- **AC11.** When a person corrects a LOT with a date conflict (CAT-41) to
  2024-06-15, the outcome is `RESOLVED` with the version `01`.
- **AC12.** When a LOT was registered with a confirmed kit-code mismatch
  (CAT-40), the outcome is `RESOLVED`.
- **AC13.** When a person withdraws the version `03` with reopen (IFU-31), a
  LOT of 2026-03-09 gets the version `02`.

### IFU-70 Lookup page

**What.** The public page where a visitor gets the IFU of a LOT.

**Rules.**
1. The page is at `/eifu` (DEC-075). The page at `/` has a link to it
   (ACC-50).
2. One page holds both steps. The verification step shows the full consent
   text and its version. While the consent text is a draft, the step also
   shows a draft marker (DEC-074). The consent box is not ticked when the page
   opens (DEC-087).
3. The header has the language choice (DEC-017).
4. The result shows the catalog number, the LOT number, the manufacturing
   date, the document number, the revision label and one download link for
   each language. It has no success banner and no success color (DEC-019).
   The page shows identifiers in IBM Plex Mono (DEC-016).
5. Each outcome other than `RESOLVED` (DEC-073, DEC-068) has its own localized
   text. For each failure, the page shows the text of its error code and
   field, and the error code (DEC-013, DEC-122).
6. The page meets DEC-018. Search engines do not index it.

**Screens.** `/eifu`: the verification step, the code step and the result.

**Acceptance.**
- **AC1.** When a visitor opens `/eifu`, the page shows the fields for the
  catalog number, the LOT number and the email address. It also shows the
  full consent text with its version, and a consent box that is not ticked.
  The visitor needs no session.
- **AC2.** When the consent text is a draft, the page marks it as a draft.
- **AC3.** When a visitor completes both steps for a resolvable LOT, the page
  shows the catalog number, the LOT number and the manufacturing date. It
  also shows the document number, the revision label and one download link
  for each language. It shows no success banner and no success color.
- **AC4.** When the result shows a download link, its accessible name holds
  the document type, the language name and the word PDF.
- **AC5.** When the outcome is not `RESOLVED`, the page shows the text of that
  outcome and the outcome code.
- **AC6.** When the system cannot send the code mail, the page tells the
  visitor that the code mail failed. The page also shows the error code of
  the answer.
- **AC7.** When the code is wrong, the page shows the number of attempts that
  remain.
- **AC8.** When a step fails, the page shows the dictionary text of the error
  code and the field, and the error code. The page does not show the
  `message` of the answer.
- **AC9.** When a browser loads `/eifu`, the answer has the header
  `X-Robots-Tag: noindex`.
- **AC10.** When a person uses only the keyboard, the person can complete both
  steps and reach each download link.

**Trace.** eng/eifu-domain.md §The public address; eng/accessibility.md §e-IFU specifics; eng/design-system.md §Success is not a colour

## Access records and personal data

This section gives the access record of each lookup, its protection, its
retention and its erasure. In the acceptance criteria, "fails" means that the
system refuses the action with the error code that the criterion names, and
no row changes.

### IFU-80 Access records

**What.** One access record for each lookup, also when its outcome is not
`RESOLVED`.

**Rules.**
1. Each lookup writes one access record (DEC-078), on the lawful basis of
   DEC-079. The access record follows DEC-091.
2. The access record holds these values:
   - the inputs as the visitor typed them;
   - the ids of the resolved product and the resolved version, with no
     foreign key, so that the record stays after any change of the catalog;
   - the outcome;
   - `resolvedViaOverride`;
   - the consent text version;
   - `emailVerified` (true);
   - the user agent (at most 512 characters);
   - the request id;
   - the time;
   - the email address and the client address (DEC-038), which the system
     encrypts (IFU-90).
3. If the system cannot write the access record, the lookup fails with 500
   `DB-5001`. It gives no download link.
4. The system never deletes an access record (DEC-010).

**Data.** `eifu_access_record`: `catalog_number_input`, `lot_number_input`,
`resolved_product_id`, `resolved_document_version_id`, `outcome`,
`resolved_via_override`, `acknowledged_notice_version`, `email_verified`,
`email` (encrypted), `client_address` (encrypted), `email_lookup_hash`,
`identity_key_id`, `user_agent`, `request_id`, `created_at`,
`anonymized_at`. The table has an index on `(created_at, anonymized_at)`.

**Acceptance.**
- **AC1.** When a lookup resolves, one access record holds the inputs, the
  product id, the version id and the outcome `RESOLVED`. The record also
  holds the consent text version, `emailVerified` true and the request id.
- **AC2.** When a lookup gets `LOT_NOT_FOUND`, one access record holds the
  inputs and that outcome, and no version id.
- **AC3.** When a verification request fails validation, or a verification
  never gets its correct code, the system writes no access record.
- **AC4.** When the LOT input was `" B2603091224GHPVV "`, the access record
  holds it with the spaces.
- **AC5.** When `TRUSTED_PROXIES` holds `10.0.0.5`, and a request from
  `10.0.0.5` has the header `X-Forwarded-For: 1.1.1.1, 2.2.2.2`, the client
  address of the record is `2.2.2.2` (DEC-038).
- **AC6.** If the system cannot write the access record, the lookup fails
  with 500 `DB-5001`, and the answer holds no download link.

**Trace.** eng/eifu-resolution-specification.md §Access recording; eng/data-model-fields.md §EIFUAccessRecord; audit D-1, D-9

### IFU-81 Retention pass

**Acceptance.** The pass runs in PLT-30 and follows DEC-080.
- **AC1.** When the pass runs, it changes each record that is 3,654 days old
  and not anonymized. The record loses its email address, client address,
  lookup hash and key id.
  The record gets `anonymizedAt`, and keeps every other column. The row
  stays.
- **AC2.** When the pass runs, a record created 3,652 days before does not
  change.
- **AC3.** When `EIFU_ACCESS_RECORD_RETENTION_DAYS` is `0`, the pass changes no
  record.
- **AC4.** When `EIFU_ACCESS_RECORD_RETENTION_DAYS` is not set, the period is
  3,653 days.
- **AC5.** When the pass runs, it writes one `AUDIT` record with the cutoff
  date and the number of records. It does not write an `AUDIT` record for
  each row.
- **AC6.** If a statement stamps `anonymized_at` on a record that keeps an
  identity field, the database refuses the statement (constraint
  `access_record_anonymized_keeps_no_identity`).

### IFU-82 Erasure on request

**Acceptance.** `POST /api/v1/eifu/erasures` takes `email` and `reason`. It
needs `platform.system.administer`, and answers 200 (DEC-082). The
administrator keeps the reference of each request outside the database
(DEC-036).
- **AC1.** When an administrator erases an email address that has 3 access
  records, the system anonymizes those records. The answer holds
  `anonymizedCount` 3. The records of other email addresses do not change.
- **AC2.** When the request names `Person@Example.com` and the records hold
  `person@example.com`, the erasure finds the records and anonymizes them.
- **AC3.** When a verification that did not end has this email address, the
  erasure also clears its email address and its client address.
- **AC4.** If the request has no reason, it fails with 400 `VAL-4001`.
- **AC5.** If an IFU Manager sends the request, it fails with 403 `PERM-4150`.
- **AC6.** When an erasure succeeds, one `AUDIT` record holds the number of
  records and the reason. The `AUDIT` record does not hold the email address
  (DEC-014).
- **AC7.** When no record matches, the answer holds `anonymizedCount` 0. The
  system writes the `AUDIT` record.

### IFU-83 Lookup report

**Acceptance.** `GET /api/v1/eifu/reports/lookups` takes the query parameters
`startDate` and `endDate`. It needs `eifu.access_record.view_aggregated`, and
follows DEC-084 and DEC-085. The dates follow DEC-039. A day starts at 00:00
Europe/Istanbul (DEC-012).
- **AC1.** When a holder asks for a date range, the answer gives the number
  of lookups for each day, each outcome and each product. The answer holds no
  email address, no client address and no input.
- **AC2.** When the request has no `startDate` and no `endDate`, the range is
  the 30 days that end today.
- **AC3.** If the range is longer than 366 days, the request fails with 400
  `VAL-4006`.
- **AC4.** If `endDate` is before `startDate`, the request fails with 400
  `VAL-4004`.
- **AC5.** If `startDate` is not a date, the request fails with 400
  `VAL-4003`.
- **AC6.** When records in the range are anonymized, the report counts them
  the same as the other records.

### IFU-84 Access record list

**Acceptance.** `GET /api/v1/eifu/access-records` needs
`eifu.access_record.view_raw` (DEC-085).
- **AC1.** When a holder lists the records of one document version, each
  record shows its time, its inputs and its outcome. No record shows an
  identity.
- **AC2.** If a person who has only `eifu.access_record.view_aggregated` asks
  for the list, the request fails with 403 `PERM-4150`.
- **AC3.** When the list is longer than one page, the answer has `page`,
  `count`, `totalCount` and `filterParams`, as `sds-api-design` says.

### IFU-90 Identity protection

**What.** The encryption of the email address and the client address of a
public lookup, and the keys of this encryption.

**Rules.**
1. The protection follows DEC-079, DEC-081, DEC-083, DEC-088, DEC-089 and
   DEC-090.
2. The encrypted fields are the email address and the client address of
   `eifu_access_record` and of `eifu_verification`.
3. The key ring is `EIFU_IDENTITY_KEYS`, with the newest key first. A write
   uses the first key. The row stores the id of that key. A read uses the key
   that the row names.
4. The lookup hash is HMAC-SHA-256 of the lower-case email address with
   `EIFU_IDENTITY_LOOKUP_PEPPER`.
5. In production, the app does not report ready without the key ring or with
   a short pepper (FND-03).
6. A job of PLT-30 moves the rows that name an older key to the first key. It
   moves at most 500 rows in each pass.

**Acceptance.**
- **AC1.** When a lookup writes its access record, the database column of the
  email address holds no plain text. The app with the key ring reads the
  column and gets the email address.
- **AC2.** When a new key is first in the ring, new records name the new key
  id. After the next pass, at most 500 records that named the old key name
  the new key.
- **AC3.** If `EIFU_IDENTITY_KEYS` is not set when `APP_ENV` is `production`,
  the app does not report ready. A `FATAL` log record has `CFG-5000`.

**Trace.** adr/0017; ops/incidents.md §Rotating the identity key

### IFU-91 Identity read

**Acceptance.** `POST /api/v1/eifu/access-records/{id}/identity-reads` takes
`reason` and needs `eifu.access_record.view_raw` (DEC-085).
- **AC1.** When a holder reads the identity of a record with a reason, the
  answer holds the email address and the client address. Before the read,
  the system writes an `AUDIT` record with the actor, the record id and the
  reason.
- **AC2.** If the request has no reason, it fails with 400 `VAL-4001`, and the
  answer gives no identity.
- **AC3.** If the record names a key that is not in the ring, the read fails
  with 409 `RES-4302`. The `AUDIT` record of the attempt exists.
- **AC4.** If the record is anonymized, the read fails with 409 `RES-4302`.
- **AC5.** If a person without `eifu.access_record.view_raw` reads an
  identity, the read fails with 403 `PERM-4150`.
