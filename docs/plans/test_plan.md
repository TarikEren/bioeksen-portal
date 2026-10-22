# Stage B2: Product catalog (crisis mode)

This is the contract of stage B2, step 1 of the loop of `crisis_mode.md`
(DEC-136). It names what the agents build. It writes no test. The contract of
B1 is in git: `git show feature/b1-identity:docs/plans/test_plan.md`.

**Status.** The owner approved this contract on 2026-10-22.

**Items.** FND-09 (AC3), CAT-10, CAT-20, CAT-30, CAT-40 (with CAT-41), CAT-50,
CAT-60 (with CAT-61).

**Exit flow** (README › *Build order*). On the demo: an IFU Manager enters a
product with two catalog numbers, imports LOTs with a row report, and
corrects a LOT whose dates disagree. Each change has its
`platform_audit_record` row.

**Rules in force that are Pending.** DEC-013 (SDS), DEC-039 (SDS), DEC-040
(PM), DEC-044, DEC-046, DEC-047 (QA), DEC-048 (PM), DEC-050 (QA), DEC-135 (IT).
The build follows the rule in each row until the owner answers.

**The UI reference.** The mockup `BioeksenPortal/frontend`,
`src/features/catalog/` (product list, product page, new product, new catalog
number, LOT panel, date correction drawer, LOT import form). The specs win on
a conflict.

## API

All paths are under `/api/v1/catalog/`. Bodies and lists follow
`sds-api-design` and B1 (camelCase, ids as strings, 201 with `Location`, the
list body, `PATCH` as a JSON Merge Patch). Each route needs a session (401
`AUTH-4100`), checks `Origin` on a change (401 `AUTH-4101`), and needs the
permission of its row (403 `PERM-4150`). Business dates are `YYYY-MM-DD`
(DEC-039).

| Method and path | Permission | Body or query | Success | Failures |
|---|---|---|---|---|
| `GET products` | `catalog.product.view` | `page`, `limit`, `q` (stem, name in either language, or catalog number), `active` | 200 list of `ProductSummary` | — |
| `POST products` | `catalog.product.manage` | `CreateProductInput`: `internalCode`, `name {tr, en}`, `description {tr, en}?`, `regulatoryStatus`, `kitCodeBase?` | 201 `{ product: ProductDetail }`; one audit row (CAT-10.AC1) | 409 `RES-4300` same stem and status (AC2); 400 `VAL-4001`, `details` names the missing entry (AC3) |
| `GET products/{id}` | `catalog.product.view` | — | 200 `{ product: ProductDetail }` with its catalog numbers | 404 `RES-4200` |
| `PATCH products/{id}` | `catalog.product.manage` | `name`, `description`, `internalCode`, `regulatoryStatus`, `kitCodeBase` | 200; one audit row | 409 `RES-4302` stem or status while the product has a LOT (AC4; the document check comes in B3); 409 `RES-4300` |
| `POST products/{id}/deactivation` | `catalog.product.manage` | — | 200; the row stays; one audit row (AC5) | 409 `RES-4302` when inactive |
| `POST products/{id}/catalog-numbers` | `catalog.catalog_number.manage` | `catalogNumber`, `packSize?`, `format?` | 201 `{ catalogNumber: CatalogNumberView }`; cleanup once (CAT-20.AC3); one audit row (AC1) | 409 `RES-4300` anywhere in the catalog (AC2) |
| `PATCH catalog-numbers/{id}` | `catalog.catalog_number.manage` | `packSize`, `format`, `productId` (a move) | 200; one audit row | 409 `RES-4302` a move while it has a LOT (AC4) |
| `POST catalog-numbers/{id}/deactivation` | `catalog.catalog_number.manage` | — | 200; the row stays (AC5) | 409 `RES-4302` when inactive |
| `GET products/{id}/lots` | `catalog.lot.view` | `page`, `limit`, `catalogNumberId?`, `conflict?` | 200 list of `LotView` (dates, source, conflict marker) | 404 `RES-4200` |
| `POST catalog-numbers/{id}/lots` | `catalog.lot.manage` | `lotNumber`, `suppliedManufacturingDate?`, `expiryDate?`, `confirmKitCodeMismatch?` | 201 `{ lot: LotView }`; one audit row with both dates where they differ (CAT-40) | 409 `RES-4300` (AC2); 400 `VAL-4006` on `lotNumber` (format, date, kit code: three issues) or `expiryDate` (CAT-30.AC2, AC3; CAT-40.AC6, AC7) |
| `POST lots/{id}/manufacturing-date-correction` | `catalog.lot.correct` | `manufacturingDate`, `reason` | 200; source `MANUAL_CORRECTION`, no conflict; one audit row with the date before, after, the encoded date and the reason (CAT-41.AC1) | 400 `VAL-4001` no reason (AC2); 403 `PERM-4150` (AC3) |
| `POST lot-imports/preview` | `catalog.lot.manage` | the import input (below) | 200 `{ plan }`: each row with its outcome and reason, grouped by product, the counts, and a warning when an earlier import had the same hash (CAT-60 rule 9) | 400 `VAL-4001` no input; 400 `VAL-4006` with a `details` entry for each fault (AC10, AC19, AC20); 413 `VAL-4550` (AC11) |
| `POST lot-imports` | `catalog.lot.manage` | the import input | 201 with `Location`, `{ import: LotImportView }`; one audit row with the counts (AC2) | as the preview; a stop records the import as `FAILED` (AC14) |
| `GET lot-imports` | `catalog.lot.view` | `page`, `limit` | 200 list of `LotImportView` (the screen *LOT imports*) | — |
| `GET lot-imports/{id}` | `catalog.lot.view` | — | 200 `{ import: LotImportView }` with its counts | 404 `RES-4200` |
| `GET lot-imports/{id}/rows` | `catalog.lot.view` | `page`, `limit`, `outcome?` | 200 list of `LotImportRowView` | 404 `RES-4200` |
| `GET lot-imports/template` | `catalog.lot.manage` | — | 200, an XLSX in the active language (CAT-61.AC1) | — |

**The import input.** `multipart/form-data` with the fields `text` (pasted
text) or `file`, `productId?` (an import for one product, CAT-60 rule 5) and
`catalogNumber?` (one-column input without a header, rule 4). The body limit
is 5 MiB (DEC-051), counted as it arrives, before the media type (B0 order).

## Data

One migration `catalog` (`prisma migration plan`, never `db update`). The
DELETE and TRUNCATE triggers call `platform_refuse_delete()` as `rawSql` in the
same migration, on each table (DEC-010).

| Table | Columns and constraints (the spec names them) |
|---|---|
| `catalog_product` | `id`; `internal_code` (≤ 64); `name` JSONB `{tr, en}` with its check (DEC-011); `description` JSONB, optional, same check; `regulatory_status` check `IVD`/`RUO`, no default; `kit_code_base` (≤ 32), optional; `is_active`; `created_at`, `updated_at`. `product_unique_identity` `UNIQUE (internal_code, regulatory_status)` |
| `catalog_catalog_number` | `id`; `product_id` → `catalog_product` restrict; `catalog_number` (≤ 64); `pack_size` (≤ 32), optional; `format` check `VCAP`/`LYOPHILIZED`/`LIQUID`, optional; `is_active`; timestamps. `catalog_number_unique` `UNIQUE (catalog_number)` |
| `catalog_lot` | `id`; `catalog_number_id` → restrict; `lot_number` (≤ 64); `manufacturing_date` date; `manufacturing_date_source` check `PARSED_FROM_LOT`/`SUPPLIED`/`MANUAL_CORRECTION`; `supplied_manufacturing_date` date, optional; `expiry_date` date, optional; `has_date_conflict`; `lot_import_id`, optional; timestamps. `lot_unique_per_catalog_number`; `lot_expiry_after_manufacturing`; index `lot_number_idx` |
| `catalog_lot_import` | `id`; `source_filename`, optional; `source_hash`; `product_id`, optional; `uploaded_by_user_id`; `status` check `PROCESSING`/`COMPLETED`/`FAILED`; `row_count`, `created_count`, `existing_count`, `conflict_count`, `invalid_count`; `failure_code` (only when `FAILED`); `created_at`, `completed_at`. `lot_import_counts_add_up` |
| `catalog_lot_import_row` | `id`; `lot_import_id`; `row_number` (from 1); `outcome`; `reason`; `raw_cells` JSONB; `lot_id`, optional. `lot_import_row_unique` |

`uploaded_by_user_id` holds the user id with no foreign key to
`identity_user` (DEC-004: a module reads another module only through its
service).

Audited actions (PLT-40): `catalog.product.created`, `catalog.product.changed`,
`catalog.product.deactivated`, `catalog.catalog_number.created`,
`catalog.catalog_number.changed`, `catalog.catalog_number.deactivated`,
`catalog.lot.registered`, `catalog.lot.manufacturing_date_corrected`,
`catalog.lot_import.committed`. A move of a catalog number is a `changed`
row with the product before and after.

**The import status of a stop** (CAT-60 rule 8): the commit transaction rolls
back, then a second transaction records the import as `FAILED` with the code.

## Services and types

Types and zod schemas: `src/lib/schemas/catalog.ts` (`CreateProductInput`,
`UpdateProductInput`, `ProductSummary`, `ProductDetail`, `CatalogNumberInput`,
`CatalogNumberView`, `RegisterLotInput`, `LotView`, `CorrectionInput`,
`ImportPlan`, `LotImportView`, `LotImportRowView`, `RegulatoryStatus`,
`Format`, `Outcome`, `Reason`).

| File | Functions |
|---|---|
| `src/modules/catalog/domain/lot-number.ts` | `cleanTransport(value)` (CAT-30 rule 1), `readEncodedDate(lotNumber)` (DEC-044). No other code takes a substring of a LOT number (rule 3) |
| `src/modules/catalog/domain/kit-code.ts` | `expectedKitCode(base, format)`, `kitCodeMatches(lotNumber, base, format)` (DEC-048, DEC-049) |
| `src/modules/catalog/domain/supplied-date.ts` | `readSuppliedDate(cell)` (DEC-053) |
| `src/modules/catalog/domain/import-reader.ts` | the input to rows: CSV, TSV, text, XLSX (first sheet); UTF-8 or Windows-1254 (DEC-052); the header labels in either language, without letter case and accents; the no-header cases (rule 4) |
| `src/modules/catalog/domain/import-planner.ts` | one outcome and one reason for each row (rule 6), from the rows and the registered LOTs |
| `src/modules/catalog/services/product-service.ts` | `listProducts`, `createProduct`, `getProduct`, `updateProduct`, `deactivateProduct` |
| `src/modules/catalog/services/catalog-number-service.ts` | `addCatalogNumber`, `updateCatalogNumber`, `deactivateCatalogNumber` |
| `src/modules/catalog/services/lot-service.ts` | `listLots`, `registerLot`, `correctManufacturingDate` |
| `src/modules/catalog/services/lot-import-service.ts` | `previewImport`, `commitImport`, `listImports`, `getImport`, `listImportRows`, `importTemplate(actor, language)` |

Each service takes the session `actor` and checks its permission. The vectors
of CAT-30 rule 5 are one data file, `tests/fixtures/cat-30-vectors.json`,
which the test phase reads.

**Mock data** (step 2): `src/lib/mock/catalog.ts`: three products
(`BS-GHPV-L` `IVD` with the kit code base `GHPV` and the catalog numbers
`BS-GHPV-L-100` and `BS-GHPV-L-25`, both `VCAP`; `BS-STI-L` `IVD`; `BS-STI-L`
`RUO`), five LOTs (one with a date conflict), and one import with its rows.
Each mock function carries `// MOCK: <item>`.

## UI

The text comes from the dictionaries, in the group `catalog`. A catalog
number, a LOT number and a manufacturing date are in IBM Plex Mono; their
labels are in IBM Plex Sans (FND-09.AC3, DEC-016). A conflict shows with an
icon and a text, never by color alone (DEC-019).

| Page | Path | Content |
|---|---|---|
| Products | `/backoffice/catalog/products` | The list with the search (stem, name, catalog number) and the status; "new product" with `catalog.product.manage` |
| New product | `/backoffice/catalog/products/new` | Stem, name tr/en, description tr/en, regulatory status (no default), kit code base |
| Product | `/backoffice/catalog/products/[id]` | The details, change and deactivate; the catalog numbers with add, change, move and deactivate; the LOTs with the dates, the source and the conflict marker, the single-LOT form with the confirmation of a kit-code mismatch (DEC-050), and the date correction with a reason (CAT-41). The documents section comes in B3 |
| LOT imports | `/backoffice/catalog/lot-imports` | The list of imports with the status and the counts; "new import" with `catalog.lot.manage`; the template download |
| New import | `/backoffice/catalog/lot-imports/new` | The paste field, the file field, the choice of one product, the preview grouped by product with the outcome of each row and the hash warning, the commit |
| Import report | `/backoffice/catalog/lot-imports/[id]` | The counts and the rows, with the outcome, the reason and the raw cells |

The sidebar gains the group *e-IFU* with *Product catalog*
(`catalog.product.view`) and *LOT imports* (`catalog.lot.view`). The card
*Product catalog* of the start page becomes a link.

## Tasks

| Step | Who | Done when |
|---|---|---|
| 2 Mock skeleton | Backend agent | The schemas, every service of the table on mocks, the routes and the server actions, the multipart route wrapper |
| 3 Frontend | Frontend agent | Each page of the UI table works on the mocks, in Turkish and English, after the mockup |
| 4 Backend | Backend agent | The migration, the repositories, the real services, the domain functions, the XLSX reading and the template, the vectors file. Each `MOCK:` goes |
| 5 Phase review | `code-reviewer` | The commits of B2, against the items above |
| 6 Fix | Developers | Only a finding that blocks B3, unless the owner calls for more |
| 7 Stage check | Main session | The gate of `crisis_mode.md` §5, with the exit flow in the demo |

**Choices the specs left open.** The owner accepted them on 2026-10-22, and
they are Default decisions now: DEC-054 (the `multipart/form-data` input),
DEC-055 (`exceljs` and the `TextDecoder` of Node), DEC-056 (the list of the
imports) and DEC-057 (the permission of the template download).
