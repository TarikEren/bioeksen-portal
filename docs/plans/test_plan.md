# Stage B3: Documents and publication (crisis mode)

This is the contract of stage B3, step 1 of the loop of `crisis_mode.md`
(DEC-136). It names what the agents build. It writes no test. The contract of
B2 is in git: `git show feature/b2-catalog:docs/plans/test_plan.md`.

**Status.** The owner approved this contract on 2026-10-22.

**Items.** IFU-10, IFU-20, IFU-30 (with IFU-31, IFU-32), IFU-40, and the
document part of CAT-10.AC4 (IFU-10 rule 5, AC8).

**Exit flow** (README › *Build order*). On the demo, as the IFU Manager: one
document of `BS-GHPV-L` gets three versions, each with a file, published with
the starts 2024-01-01, 2025-01-01 and 2026-01-01. The periods are
[2024-01-01, 2025-01-01), [2025-01-01, 2026-01-01) and [2026-01-01, open), and
the first two versions are `SUPERSEDED` (IFU-30.AC1, AC2). The manager replaces
the `tr` file of a published version with a reason, withdraws a version, and
sets an override from a LOT to a `SUPERSEDED` version. Each change has its
`platform_audit_record` row.

**Rules in force that are Pending.** DEC-013, DEC-039 (SDS), DEC-060 (QA),
DEC-135 (IT). The build follows the rule in each row.

**The UI reference.** The mockup `BioeksenPortal/frontend`,
`src/features/documents/` (document list, document page, new document, new
revision, file upload, publish form, LOT override page and drawer, LOT picker)
and `src/features/catalog/ProductDocuments.tsx`. The specs win on a conflict.

## API

All paths are under `/api/v1/eifu/`. Bodies, lists, `PATCH` (JSON Merge Patch),
the session, the Origin check and the permission refusals follow B1 and B2.
Business dates are `YYYY-MM-DD` (DEC-039).

| Method and path | Permission | Body or query | Success | Failures |
|---|---|---|---|---|
| `GET documents` | `eifu.document.view` | `page`, `limit`, `productId?`, `q` (document number or title) | 200 list of `DocumentSummary` (product, the version in force today) | — |
| `POST documents` | `eifu.document.manage` | `documentNumber`, `title {tr, en}`, `productId` | 201 `{ document }`; one audit row (IFU-10.AC1) | 409 `RES-4300` (AC2); 400 `VAL-4001` |
| `GET documents/{id}` | `eifu.document.view` | — | 200 `{ document: DocumentDetail }` with its versions, states and periods | 404 `RES-4200` |
| `PATCH documents/{id}` | `eifu.document.manage` | `title`, `productId` | 200; one audit row | 409 `RES-4302` a product change after a publication (AC4) |
| `POST documents/{id}/versions` | `eifu.document.manage` | `revision`, `proposedEffectiveFrom?` | 201 `{ version }` as `DRAFT` (AC3) | 409 `RES-4300` (AC3) |
| `GET document-versions/{id}` | `eifu.document.view` | — | 200 `{ version: VersionDetail }` with its files, its period, its replacements | 404 `RES-4200` |
| `PATCH document-versions/{id}` | `eifu.document.manage` | `proposedEffectiveFrom` | 200; one audit row (AC5) | 409 `RES-4302` when not `DRAFT` (AC6) |
| `POST document-versions/{id}/files` | `eifu.document.manage` | multipart: `languageCode`, `file`, `sha256?`; limit 20 MiB | 201 `{ file }`; one audit row (IFU-20.AC1) | 400 `VAL-4006` on `file` (not a PDF, no bytes, a hash that differs) or `languageCode` (AC2, AC6–AC8); 413 `VAL-4550` (AC3); 409 `RES-4300` (AC4); 409 `RES-4302` (AC5) |
| `POST document-files/{id}/deactivation` | `eifu.document.manage` | — | 200; the row stays (AC9) | 409 `RES-4302` when the version is not `DRAFT` |
| `GET document-files/{id}/download-url` | `eifu.document.view` | — | 200 `{ url }`: a signed URL of DEC-076 (5 minutes, the attachment name of DEC-076) | 404 `RES-4200` |
| `POST document-versions/{id}/publication` | `eifu.document.publish` | `effectiveFrom`, `expectedProductId` | 200; the period of IFU-30 rule 3; one audit row with the superseded version (AC1, AC2) | 400 `VAL-4006` on `effectiveFrom` (AC3, AC8); 409 `RES-4302` (AC4, AC5); 409 `RES-4301` (AC6) |
| `POST document-versions/{id}/withdrawal` | `eifu.document.withdraw` | `reason`, `reopenPrevious?` | 200; one audit row with the reason and the reopened version (IFU-31.AC1, AC2, AC5) | 409 `RES-4302` (AC3); 400 `VAL-4001` (AC4) |
| `POST document-files/{id}/replacement` | `eifu.document.replace_published_file` | multipart: `reason`, `file`, `sha256?`; limit 20 MiB | 201 `{ file, replacement }`; one audit row (IFU-32.AC1) | 400 `VAL-4006` same bytes (AC2); 400 `VAL-4001` (AC3); 400 `VAL-4007` a `languageCode` (AC4); 409 `RES-4302` (AC5) |
| `GET lots/{lotId}/overrides` | `eifu.document.view` | — | 200 `{ active, history }` | 404 `RES-4200` |
| `POST lots/{lotId}/overrides` | `eifu.lot_override.manage` | `documentVersionId`, `reason` | 201 `{ override }`; one audit row (IFU-40.AC1) | 400 `VAL-4006` on `documentVersionId` (AC2, AC3); 409 `RES-4300` (AC4); 400 `VAL-4001` (AC5) |
| `POST lot-overrides/{id}/deactivation` | `eifu.lot_override.manage` | `reason` | 200; the row stays; one audit row (AC6) | 400 `VAL-4001` (AC7) |
| `GET lot-overrides` | `eifu.document.view` | `page`, `limit`, `active?` | 200 list of `LotOverrideView` | — |

The file body is read as it arrives, with the order of B0 (size, then media
type). The server reads the type from the bytes (`%PDF-`), not from the name
(IFU-20 rule 2).

## Data

One migration `eifu_documents` (`prisma migration plan`, never `db update`).
The extension `btree_gist`, the exclusion constraint, the triggers and the
DELETE/TRUNCATE triggers with `platform_refuse_delete()` are `rawSql` in the
same migration (DEC-005).

| Table | Columns and constraints (the spec names them) |
|---|---|
| `eifu_document` | `document_number` (`document_number_unique`); `document_type` check `IFU`; `title` JSONB `{tr, en}` with its check (DEC-011); `product_id` → `catalog_product` restrict. Trigger `document_product_is_settled` |
| `eifu_document_version` | `document_id`; `revision` (≤ 16); `status` check `DRAFT`/`PUBLISHED`/`SUPERSEDED`/`WITHDRAWN`; `proposed_effective_from` date; `published_at`, `published_by_user_id`, `superseded_at`, `withdrawn_at`, `withdrawn_by_user_id`, `withdrawal_reason`. `document_version_unique_revision` |
| `eifu_document_file` | `document_version_id`; `language_code` (≤ 35); `storage_key`; `file_hash` (64 hex); `file_size_bytes`; `content_type`; `original_filename`; `is_active`. `document_file_one_active_per_language` |
| `eifu_applicability` | `document_version_id`; `product_id`; `effective_from`, `effective_to` dates; `withdrawn_at`. `applicability_period_is_ordered`; `applicability_no_overlap_per_product` (EXCLUDE … gist, `btree_gist`); trigger `applicability_on_document_product`; index `applicability_lookup_idx` |
| `eifu_file_replacement` | the columns of IFU-32 *Data*; `file_replacement_reason_is_present` |
| `eifu_lot_override` | `lot_id` → `catalog_lot` restrict; `document_version_id`; `reason`; `created_by_user_id`; `is_active`; `ended_by_user_id`, `ended_at`, `end_reason`. `lot_override_reason_is_present`; `lot_override_one_active_per_lot` |

The user columns (`*_by_user_id`) have no foreign key to `identity_user`
(DEC-004, as in B2).

**The document lock of a product** (IFU-10 rule 5, AC8; CAT-10.AC4). The stem
and the regulatory status of a product change only while no document names
it. The catalog module must not import the eifu module (the eifu module reads
the catalog). The check is a trigger in this migration on `catalog_product`
(`product_identity_is_settled`), which refuses the change when an
`eifu_document` names the product; the catalog service maps it to 409
`RES-4302`.

Audited actions (PLT-40): `eifu.document.created`, `eifu.document.changed`,
`eifu.document_version.created`, `eifu.document_version.changed`,
`eifu.document_file.uploaded`, `eifu.document_file.deactivated`,
`eifu.document_version.published` (the row names the superseded version),
`eifu.document_version.withdrawn` (the reason, the reopened version),
`eifu.document_file.replaced`, `eifu.lot_override.created`,
`eifu.lot_override.ended`.

The files go to the object store through `storeDocumentFile` of PLT-10 (B1),
with the key of PLT-10 rule 3 and `If-None-Match: *`.

## Services and types

Types and zod schemas: `src/lib/schemas/eifu.ts` (`CreateDocumentInput`,
`UpdateDocumentInput`, `DocumentSummary`, `DocumentDetail`,
`CreateVersionInput`, `UpdateVersionInput`, `VersionDetail`, `FileView`,
`PeriodView`, `PublishInput`, `WithdrawInput`, `ReplacementView`,
`CreateOverrideInput`, `EndOverrideInput`, `LotOverrideView`,
`VersionStatus`, `LanguageCode` (BCP 47, ≤ 35, DEC-069)).

| File | Functions |
|---|---|
| `src/modules/eifu/services/document-service.ts` | `listDocuments`, `createDocument`, `getDocument`, `updateDocument`, `createVersion`, `getVersion`, `updateVersion` |
| `src/modules/eifu/services/file-service.ts` | `uploadFile`, `deactivateFile`, `fileDownloadUrl`, `replacePublishedFile` |
| `src/modules/eifu/services/publication-service.ts` | `publishVersion` (IFU-30 rule 3, in one transaction), `withdrawVersion` (IFU-31) |
| `src/modules/eifu/services/override-service.ts` | `listOverridesOfLot`, `createOverride`, `endOverride`, `listOverrides` |
| `src/modules/eifu/domain/pdf.ts`, `language-code.ts` | the PDF check from the bytes; the BCP 47 check |

The eifu services read products and LOTs only through the catalog services
(DEC-004). The catalog module gains the small reads that eifu needs (a product
by id, a LOT with its catalog number and product). Each service takes the
session `actor` and checks its permission.

**Mock data** (step 2): `src/lib/mock/eifu.ts`: one document `KTL-0042` of a
product, with the versions `01` (`SUPERSEDED`, [2024-01-01, 2025-01-01)),
`02` (`PUBLISHED`, [2025-01-01, open)) and `03` (`DRAFT`), each published
version with a `tr` and an `en` file; one replacement; one active override.
Each mock function carries `// MOCK: <item>`.

## UI

The text comes from the dictionaries, in the group `eifu`. A document number,
a revision label, a date, a language code and a hash are in IBM Plex Mono
(DEC-016). A state shows with an icon and a text (DEC-019); the states have
the Turkish labels of IFU-10 *States*.

| Page | Path | Content |
|---|---|---|
| Documents | `/backoffice/documents` | The list by product, with the search and the version in force today; "new document" with `eifu.document.manage` |
| New document | `/backoffice/documents/new` | Document number, title tr/en, product |
| Document | `/backoffice/documents/[id]` | The details and the change (the product only before the first publication); the versions with their states and periods as a timeline; "new version" |
| Version | `/backoffice/documents/[id]/versions/[versionId]` | The files with their language, size, hash and download link; upload and deactivate on a `DRAFT`; the proposed start; publish (`effectiveFrom`, the product that the person sees); withdraw (reason, reopen); replace a file of a published version (reason); the replacement history |
| LOT | `/backoffice/catalog/lots/[id]` | The LOT (from the catalog), its active override, the history, and the forms to create (a `PUBLISHED` or `SUPERSEDED` version of the LOT's product, a reason) and to end (a reason) an override (IFU-40 *Screens*) |
| LOT overrides | `/backoffice/lot-overrides` | The list of the overrides, active first, with a link to each LOT (after the mockup) |

The product page gains the section *Documents* (the documents of the product
and the version in force today), and each LOT row links to its LOT page. The
sidebar group *e-IFU* gains *Documents* (`eifu.document.view`) and *LOT
overrides* (`eifu.document.view`). The start-page card *Instructions for use*
becomes a link.

The document file upload goes from the browser to the route handler with
`fetch` (multipart, 20 MiB), not through a server action; the other forms use
server actions.

## Tasks

| Step | Who | Done when |
|---|---|---|
| 2 Mock skeleton | Backend agent | The schemas, every service on mocks, the routes and the server actions, the multipart route at 20 MiB |
| 3 Frontend | Frontend agent | Each page of the UI table works on the mocks, in Turkish and English, after the mockup |
| 4 Backend | Backend agent | The migration with its raw objects, the repositories, the real services, the files in MinIO, the document lock of a product. Each `MOCK:` goes |
| 5 Phase review | `code-reviewer` | The commits of B3, against the items above |
| 6 Fix | Developers | Only a finding that blocks B4, unless the owner calls for more |
| 7 Stage check | Main session | The gate of `crisis_mode.md` §5, with the exit flow in the demo |

**Carried from step 2 to step 4** (step 2 is `dbf6eef`, `ba46e00`, `5173d18`).
- The language part of the file key: `storeDocumentFile` and `signedDownloadUrl`
  of `src/modules/platform/services/file-service.ts` accept only `^[a-z]{2}$`,
  which refuses `sr-Latn-RS` (IFU-20.AC6). Step 4 widens the pattern to the
  language codes of DEC-069.
- The case of a language code: the system stores the canonical form of the tag
  (`Intl.getCanonicalLocales`, for example `sr-Latn-RS`), so that
  `document_file_one_active_per_language` compares one form.
- The trigger `product_identity_is_settled` (DEC-096) and the 409 `RES-4302` of
  the catalog service; the comment "B3 adds the check of the documents here" in
  `updateProduct` goes.
- The mock-only code of `eifu-views.ts` (`MOCK_PRODUCTS`, `MOCK_LOTS`, the seed
  fallbacks) and every `MOCK:` line.

**Filled by step 2.** The catalog reads for eifu (`catalog-reads.ts`) accept a
catalog view permission or an eifu permission, because the eifu service checks
its own permission first. A `productId` or a `documentVersionId` that names no
record gives 400 `VAL-4006` on its field (DEC-013). A withdrawal with reopen
also gives 409 `RES-4302` when no live period ends at the start of the
version's period (the system does not guess, DEC-064). A replacement of an
inactive file gives 409 `RES-4302`; a replacement with the bytes of an older
file of the same language gives 409 `RES-4300` (the store never replaces an
object, DEC-032). The issue phrases are one `as const` set, `EIFU_ISSUES` in
`src/lib/schemas/eifu.ts` (review 5, R-071).

**Choices the specs left open.** The owner accepted them on 2026-10-22, and
they are Default decisions now: DEC-092 (the file upload with `fetch`),
DEC-093 (the signed download URL for a manager), DEC-094 (the LOT page and the
list of the overrides), DEC-095 (the version page) and DEC-096 (the trigger of
the document lock of a product).

**R-065 in step 4** (owner answer 2026-10-22). The step-4 agent also fixes
R-065 of review 5: the import commit reads the catalog numbers and the products
of its rows `FOR SHARE`, sorted by id, before it plans, as `registerLot` does.
