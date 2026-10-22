# Bioeksen Portal — Product catalog

This file gives the decisions and the items of the product catalog: products,
catalog numbers, LOTs, the LOT number rules and the LOT import.
Read `README.md` first. It explains the IDs, the decision status and the build order.

## Decisions

Each row is one decision. The **Decision** column gives the rule that is in
force. A *Pending* rule stays in force until the owner answers.

### Product identity

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-040 | A product is one stem with one regulatory status. The stem is the catalog number without the size token at its end. The stem keeps the `L`, `S` or `T` marker. For example, `BS-STI-L-100` and `BS-STI-L-25` are the product `BS-STI-L`, and `BS-STI-S-25` is another product. The `IVD` and the `RUO` variant of one stem are two products. | Pending | PM | questions.md 4 | CAT-10, CAT-20 | adr/0012; audit F |
| DEC-041 | People enter products and catalog numbers by hand in the backoffice. They choose the regulatory status and the format of each. The system imports no product and no catalog number from the catalog export. The system never uses a name, a suffix or a row order to find the regulatory status. | Decided | PO | — | CAT-10, CAT-20 | eng/deferred-work.md §3 (decided 2026-09-06); adr/0012; audit D-5 |
| DEC-042 | A catalog number is unique in the whole catalog. It is the same in every country. It belongs to one product. The pack size and the format belong to the catalog number. The system never extracts the pack size from the catalog number. | Decided | PO | — | CAT-20 | eng/project-overview.md §15; adr/0012 |

### LOT numbers

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-043 | The system stores a LOT number as received, after transport cleanup only. The system never changes the letter case, removes a separator, changes an inner space, pads or cuts a LOT number. | Default | ENG | — | CAT-30, CAT-40, CAT-60 | adr/0008 §1 |
| DEC-044 | A LOT number encodes its manufacturing date as `YYMMDD`, after the `B` at its start. The system reads the date with the pattern `^B(\d{2})(\d{2})(\d{2})(.+)$` and the century base 2000. The system refuses a LOT number that does not match the pattern. The system also refuses a date that is not a calendar date. The system never corrects the LOT number or the date. | Pending | QA | questions.md 5 | CAT-30, CAT-40, CAT-60 | adr/0008; eng/eifu-resolution-specification.md §LOT number parsing |
| DEC-045 | A LOT number is unique for each catalog number, not in the whole catalog. The system never finds a LOT by its LOT number alone, with one exception. In a lookup, the system can find a LOT in this way only to separate "unknown LOT" from "LOT of another catalog number". | Default | ENG | — | CAT-40, IFU-60 | adr/0008 §9 (deferred 2026-08-23) |
| DEC-046 | When a supplied manufacturing date differs from the encoded date, neither date has priority. The system flags the LOT. A lookup refuses the LOT until a person corrects the date with a reason. | Pending | QA | questions.md 5 | CAT-40, CAT-41, CAT-60, IFU-60 | adr/0008 §6 |
| DEC-047 | An import row that names a registered LOT with another date writes nothing. The outcome of that row is `CONFLICT_REVIEW_REQUIRED`. The registered LOT keeps its date and still resolves. | Pending | QA | questions.md 6 | CAT-60 | eng/deferred-work.md §2; eng/eifu-imports.md; audit D-4 |

### Kit code and imports

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-048 | The expected kit code of a LOT is the product's kit code base, followed by the letter of the catalog number's format. The letter is `V` for `VCAP` and `L` for `LYOPHILIZED`. The format `LIQUID` adds no letter. A LOT number passes when the part after its date ends with the expected kit code, followed by zero or more digits. The system never extracts a kit code from a LOT number. | Pending | PM | questions.md 7 | CAT-50 | adr/0013 (its suffix rule contradicts its own example `KKEV1V49`); audit F |
| DEC-049 | The system checks the kit code at the registration or the import of a LOT, and never in a lookup. The system does not do the check for a product with no kit code base, or for a catalog number with no format. | Default | ENG | — | CAT-50, CAT-60 | adr/0013 §Where the check runs |
| DEC-050 | On the single-LOT form, the system shows a kit-code mismatch to the person. The system registers the LOT only when the person confirms the mismatch. The audit record holds the confirmation. | Pending | QA | questions.md 8 | CAT-40 | adr/0013 vs eng/eifu-imports.md; audit D-4 |
| DEC-051 | A LOT import takes a request body of at most 5 MiB (5,242,880 bytes) and at most 5,000 data rows. | Default | ENG | — | CAT-60 | eng/eifu-imports.md |
| DEC-052 | The import reads a CSV that is not valid UTF-8 as Windows-1254. Excel writes this encoding on a Turkish system. | Default | ENG | — | CAT-60 | eng/eifu-imports.md |
| DEC-053 | A supplied date is `YYYY-MM-DD`, `DD.MM.YYYY` or `DD/MM/YYYY`, or a date cell of an XLSX file. The day always comes before the month. | Default | ENG | — | CAT-40, CAT-60 | eng/eifu-imports.md |
| DEC-054 | The input of a LOT import is a `multipart/form-data` body with the field `text` or `file`, and the optional fields `productId` and `catalogNumber`. The server actions of the import take the same fields as `FormData`, with the body limit of DEC-051. | Default | ENG | — | CAT-60 | B2 contract; owner answer 2026-10-22 |
| DEC-055 | The app reads and writes XLSX files with `exceljs`. It reads Windows-1254 (DEC-052) with the `TextDecoder` of Node. | Default | ENG | — | CAT-60, CAT-61 | B2 contract; owner answer 2026-10-22 |
| DEC-056 | `GET /api/v1/catalog/lot-imports` lists the imports, newest first, in pages, for the screen *LOT imports*. It needs `catalog.lot.view`. | Default | ENG | — | CAT-60 | B2 contract; owner answer 2026-10-22 |
| DEC-057 | The download of the import template needs `catalog.lot.manage`. | Default | ENG | — | CAT-61 | B2 contract; owner answer 2026-10-22 |

## The catalog model

```
Product (stem + regulatory status)
  └─ Catalog number (pack size, format)        one product, unique in the catalog
       └─ LOT (LOT number, manufacturing date)  unique for each catalog number
```

A LOT reaches its product through its catalog number. An IFU applies to a
product (DEC-060). Thus, all catalog numbers of a product reach the same IFU.

## Products and catalog numbers

The module `catalog` keeps the product master. In the acceptance criteria,
"fails" means that the system refuses the action with the code that the
criterion names, and no row changes.

### CAT-10 Products

**What.** The register of products, which e-IFU and the Academy share.

**Rules.**
1. The identity of a product follows DEC-040. e-IFU and the Academy share this
   identity (DEC-001). People enter products by hand (DEC-041).
2. The name and the description follow DEC-011. The name must have an entry in
   both languages.
3. The stem and the regulatory status change only while the product has no
   LOT and no document.
4. The system never deletes a product (DEC-010). Deactivation hides the
   product from the choice lists of the backoffice.
5. `catalog.product.manage` lets a person create and change products.
   `catalog.product.view` lets a person see them. The system audits each
   creation and each change (PLT-40).

**Data.** `catalog_product`: `internal_code` (the stem, up to 64 characters),
`name` (JSONB), `description` (JSONB, optional), `regulatory_status` (`IVD` or
`RUO`, required, no default), `kit_code_base` (up to 32 characters, optional;
CAT-50), `is_active`. Constraint `product_unique_identity`:
`UNIQUE (internal_code, regulatory_status)`.

**Screens.** Backoffice › Products:
- the list, with a search by stem, name or catalog number;
- the product page with its catalog numbers, its LOTs and its documents;
- the form to create and change a product.

**Acceptance.**
- **AC1.** When an IFU Manager creates a product with a stem, a name in both
  languages and a regulatory status, the product exists. One `AUDIT` record
  names the product.
- **AC2.** If a product with the same stem and the same regulatory status
  exists, the creation fails with 409 `RES-4300`. The system creates a product
  with the same stem and the other regulatory status.
- **AC3.** If the name has no Turkish or no English entry, the creation fails
  with 400 `VAL-4001`. In the answer, `details` names the entry that the name
  does not have.
- **AC4.** When a person changes the stem of a product that has no LOT and no
  document, the change succeeds. If the product has a LOT, the change fails
  with 409 `RES-4302`.
- **AC5.** When a person deactivates a product, the row stays, and the product
  leaves the choice lists.

**Trace.** adr/0012; eng/data-model-fields.md §Product

### CAT-20 Catalog numbers

**What.** The catalog numbers of each product, with their pack size and their
format.

**Rules.**
1. A catalog number follows DEC-042. Its stem names its product (DEC-040).
   People enter it on the product page (DEC-041).
2. The system applies transport cleanup (CAT-30) to a catalog number once,
   when a person enters it. The system matches the stored value exactly.
3. A catalog number moves to another product only while it has no LOT.
4. The system never deletes a catalog number (DEC-010). A deactivated catalog
   number still resolves (IFU-62), because a person with an old box still
   needs its instructions.
5. `catalog.catalog_number.manage` lets a person create and change catalog
   numbers. The system audits each creation and each change (PLT-40).

**Data.** `catalog_catalog_number`: `product` (restrict on delete),
`catalog_number` (up to 64 characters), `pack_size` (up to 32 characters,
optional), `format` (`VCAP`, `LYOPHILIZED` or `LIQUID`, optional),
`is_active`. Constraint `catalog_number_unique`: `UNIQUE (catalog_number)`.

**Acceptance.**
- **AC1.** When an IFU Manager adds the catalog number `BS-GHPV-L-100` to a
  product, the catalog number exists under that product. One `AUDIT` record
  names it.
- **AC2.** If the catalog number exists under any product, the creation fails
  with 409 `RES-4300`.
- **AC3.** When a person enters `" BS-GHPV-L-100 "`, the system stores
  `BS-GHPV-L-100`.
- **AC4.** When a person moves a catalog number that has no LOT to another
  product, the move succeeds. If the catalog number has a LOT, the move fails
  with 409 `RES-4302`.
- **AC5.** When a person deactivates a catalog number, the row stays.

**Trace.** adr/0012; eng/data-model-fields.md §CatalogNumber

## LOTs

This part gives the LOT register, the LOT number rules and the LOT import. In
the acceptance criteria, "fails" means that the system refuses the action with
the code that the criterion names, and no row changes. An import row's outcome
and reason are data of the import (CAT-60), not error codes.

### CAT-30 LOT number rules

**What.** The two rules that make a stored LOT number and a manufacturing date
from a received LOT number.

**Rules.**
1. **Transport cleanup** removes these characters, in this order:
   - a BOM (`U+FEFF`) at the start;
   - the whitespace characters `U+0020`, tab, `\r`, `\n`, `U+00A0`, `U+2007`
     and `U+202F` at both ends;
   - the quote characters `"` and `'` at both ends;
   - the whitespace characters at both ends again.

   Transport cleanup changes nothing inside the value (DEC-043). It is not
   JavaScript's `String.trim()`.
2. **Date reading** follows DEC-044 and runs on the cleaned value.
3. Each rule is one function with its own tests. No other code takes a
   substring of a LOT number.
4. The system applies transport cleanup once, where a LOT number enters: the
   registration (CAT-40), the import (CAT-60) and the lookup input. The lookup
   uses the cleaned value only for the match (IFU-60).
5. The vectors below are one data file that the tests of both rules read.

**Data.** The vectors. `␠` marks `U+0020` and `⍽` marks `U+00A0`, so that a
reader can see the difference between the two:

| Set | Input | Result |
|---|---|---|
| valid | `B2603091224GHPVV` | 2026-03-09 |
| valid | `B240101X` | 2024-01-01 |
| valid | `B991231ZZZZ` | 2099-12-31 |
| valid | `B000101A` | 2000-01-01 |
| valid | `B2402290000` | 2024-02-29 |
| format invalid | `B260309`, `2603091224GHPVV`, `b2603091224GHPVV`, `BX603091224GHP`, `B26030`, the empty string | refused |
| date invalid | `B269909XXXX`, `B260032XXXX`, `B260000XXXX`, `B250229XXXX` | refused |
| cleanup | `␠B2603091224GHPVV␠`; tab + `B2603091224GHPVV` + `\r\n`; BOM + `B2603091224GHPVV`; `"B2603091224GHPVV"`; `⍽B2603091224GHPVV⍽` | `B2603091224GHPVV` |
| kept | `b2603091224ghpvv`, `B26-03-09-1224GHPVV`, `B260309␠1224GHPVV` | not changed by cleanup |

**Acceptance.** The registration of CAT-40 is the observation point.
- **AC1.** When a person registers a LOT number of the set "valid", the stored
  manufacturing date is the date beside it.
- **AC2.** If a person registers a LOT number of the set "format invalid", the
  registration fails with 400 `VAL-4006`, and `details` names the field
  `lotNumber`.
- **AC3.** If a person registers a LOT number of the set "date invalid", the
  registration fails with 400 `VAL-4006`. In the answer, `details` names the
  field `lotNumber`, with an issue that differs from the issue of AC2.
- **AC4.** When a person registers a LOT number of the set "cleanup", the
  stored LOT number is `B2603091224GHPVV`.
- **AC5.** When a person registers `B260309␠1224GHPVV`, the stored LOT number
  keeps its inner space.
- **AC6.** If a person registers `b2603091224ghpvv` or `B26-03-09-1224GHPVV`,
  the registration fails as in AC2. The system does not change the letter
  case or remove the hyphens.

**Trace.** adr/0008; eng/eifu-resolution-specification.md §LOT number parsing

### CAT-40 LOTs

**What.** The register of LOTs, each with its manufacturing date and the
source of that date.

**Rules.**
1. A LOT belongs to one catalog number, and through it to one product. Its
   LOT number follows CAT-30, DEC-043 and DEC-045. Its dates are business
   dates (DEC-012, DEC-039). A supplied date follows DEC-053.
2. The manufacturing date is the encoded date (DEC-044). Without a supplied
   date, the source is `PARSED_FROM_LOT`. With a supplied date that is equal
   to the encoded date, the source is `SUPPLIED`.
3. A supplied date that differs from the encoded date follows DEC-046. The LOT
   keeps the encoded date and the supplied date, and gets the date-conflict
   flag. The correction follows CAT-41.
4. The expiry date is optional, and it is after the manufacturing date.
5. The single-LOT form on the product page registers one LOT
   (`catalog.lot.manage`). Its kit-code check follows DEC-050 and CAT-50.
6. The system never deletes a LOT (DEC-010). The system audits each
   registration, with both dates where they differ (PLT-40).

**Data.** `catalog_lot`: `catalog_number` (restrict on delete), `lot_number`
(up to 64 characters), `manufacturing_date`, `manufacturing_date_source`
(`PARSED_FROM_LOT`, `SUPPLIED` or `MANUAL_CORRECTION`),
`supplied_manufacturing_date` (optional), `expiry_date` (optional),
`has_date_conflict`, `lot_import` (optional; CAT-60). Constraints
`lot_unique_per_catalog_number`: `UNIQUE (catalog_number_id, lot_number)`;
`lot_expiry_after_manufacturing`:
`CHECK (expiry_date IS NULL OR expiry_date > manufacturing_date)`. Index
`lot_number_idx` on `lot_number`, for the one check of DEC-045.

**Screens.** Product page › LOTs: the list, with the dates and a conflict
marker, and the single-LOT form.

**Acceptance.**
- **AC1.** When an IFU Manager registers `B2603091224GHPVV` under
  `BS-GHPV-L-100` without a date, the LOT exists. It has the manufacturing
  date 2026-03-09, the source `PARSED_FROM_LOT` and no date conflict. One
  `AUDIT` record names the LOT.
- **AC2.** If the same LOT number exists under the same catalog number, the
  registration fails with 409 `RES-4300`.
- **AC3.** When a person registers the same LOT number under another catalog
  number, the registration succeeds.
- **AC4.** When the supplied date is 2026-03-09 for `B2603091224GHPVV`, the
  system stores the LOT with the source `SUPPLIED` and no date conflict.
- **AC5.** When the supplied date is 2026-03-10 for `B2603091224GHPVV`, the
  system stores the LOT with a date conflict. The LOT has the manufacturing
  date 2026-03-09 and the supplied date 2026-03-10. The `AUDIT` record holds
  both dates.
- **AC6.** If the expiry date is on or before the manufacturing date, the
  registration fails with 400 `VAL-4006`, and `details` names the field
  `expiryDate`.
- **AC7.** If the kit code does not match (CAT-50) and the request does not
  confirm the mismatch, the registration fails with 400 `VAL-4006`. In the
  answer, `details` names the field `lotNumber`.
- **AC8.** When the same request confirms the kit-code mismatch, the system
  registers the LOT, and its `AUDIT` record holds the confirmation.

**Trace.** adr/0008; adr/0013; eng/data-model-fields.md §Lot; eng/state-machines.md §Lot manufacturing date

### CAT-41 Manufacturing date correction

**Acceptance.**
- **AC1.** When a holder of `catalog.lot.correct` sets a new manufacturing
  date with a reason, the LOT gets that date and the source
  `MANUAL_CORRECTION`. The LOT then has no date conflict. One `AUDIT` record holds the date before, the date
  after, the encoded date and the reason (DEC-014).
- **AC2.** If the correction has no reason, the correction fails with 400
  `VAL-4001`.
- **AC3.** If a person who holds `catalog.lot.manage` and not
  `catalog.lot.correct` corrects a date, the correction fails with 403
  `PERM-4150`.

### CAT-50 Kit code verification

**What.** A second check that a LOT number belongs to the catalog number that
names it.

**Rules.**
1. The expected kit code and the match follow DEC-048.
2. The check runs only at a registration (CAT-40) and at an import (CAT-60).
   The check skips the cases of DEC-049.
3. The kit code is never a key to find a LOT or a product.
4. `catalog.product.manage` lets a person set the kit code base of a product
   (CAT-10).

**Acceptance.** The registration of CAT-40 is the observation point. "Passes"
means that the system registers the LOT without a confirmation.
- **AC1.** When the product's base is `GHPV` and the catalog number's format
  is `VCAP`, the LOT `B2603091224GHPVV` passes.
- **AC2.** When the product's base is `KKEV1` and the format is `VCAP`, the LOT
  `B260309KKEV1V49` passes.
- **AC3.** If the product's base is `HP` and the format is `LIQUID`, the LOT
  `B2603091224HPV` does not pass.
- **AC4.** When the product has no kit code base, each LOT number of the set
  "valid" of CAT-30 passes.
- **AC5.** When the catalog number has no format, each LOT number of the set
  "valid" of CAT-30 passes.

**Trace.** adr/0013; adr/0012 §Format

### CAT-60 LOT import

**What.** A preview and a commit that register many LOTs in one operation,
with an outcome for each row.

**Rules.**
1. `POST /api/v1/catalog/lot-imports/preview` reads the input and answers 200
   with the plan. It writes nothing. `POST /api/v1/catalog/lot-imports` does
   these steps:
   - it reads the same input;
   - it plans each row again inside its transaction;
   - it writes only the rows whose outcome is `CREATED`;
   - it answers 201 with `Location`.

   Both endpoints need `catalog.lot.manage`.
2. `GET /api/v1/catalog/lot-imports/{id}` gives an import and its counts.
   `GET /api/v1/catalog/lot-imports/{id}/rows` gives the rows of the import in
   pages, as `sds-api-design` says. Both endpoints need `catalog.lot.view`.
   The list of the imports follows DEC-056.
3. The input is pasted text (tab-, semicolon- or comma-separated) or a file
   (`.xlsx`, first sheet; `.csv`; `.tsv`; `.txt`), in the body of DEC-054. The
   limits of DEC-051 and the encoding of DEC-052 apply to the input. The
   reading follows DEC-055. Supplied dates follow DEC-053.
4. The system finds the columns by their header labels in either language.
   The system ignores the letter case and the accents of a label. The labels
   are:
   - for the catalog number: `Katalog No`, `Catalog No`, `catalog_number`;
   - for the LOT: `LOT`, `LOT No`, `lot_number`;
   - for the manufacturing date: `Üretim Tarihi`, `Manufacturing date`,
     `manufacturing_date`.

   The system ignores other columns. When the input has no header:
   - one column is the LOT, and the request names the catalog number;
   - two columns are the catalog number and the LOT;
   - three columns add the manufacturing date.
5. An import is for all products, or for one product. In an import for one
   product, the system refuses a row that names the catalog number of another
   product.
6. Each row gets one outcome and one reason:

| Outcome | Reason | When |
|---|---|---|
| `CREATED` | — | The row is new and passes every check |
| `ALREADY_EXISTS` | `LOT_ALREADY_EXISTS` | The LOT is registered under this catalog number with the same date |
| `ALREADY_EXISTS` | `DUPLICATE_ROW` | An earlier row of the same input names the same catalog number and LOT, with the same date |
| `CONFLICT_REVIEW_REQUIRED` | `DATE_DIFFERS_FROM_REGISTERED` | The LOT is registered under this catalog number with another date (DEC-047) |
| `CONFLICT_REVIEW_REQUIRED` | `SUPPLIED_DATE_CONFLICT` | The supplied date differs from the encoded date (DEC-046) |
| `CONFLICT_REVIEW_REQUIRED` | `KIT_CODE_MISMATCH` | The kit code does not match (CAT-50, DEC-049) |
| `CONFLICT_REVIEW_REQUIRED` | `CONFLICTING_ROWS` | Another row of the same input names the same catalog number and LOT with another date. The import writes none of these rows |
| `INVALID_CATALOG_NUMBER` | `CATALOG_NUMBER_NOT_FOUND` | No catalog number matches exactly |
| `INVALID_CATALOG_NUMBER` | `OTHER_PRODUCT` | The import is for one product, and the catalog number belongs to another product |
| `INVALID_LOT_FORMAT` | `LOT_MISSING` | The LOT cell is empty |
| `INVALID_LOT_FORMAT` | `LOT_FORMAT_INVALID` | The LOT number does not match DEC-044 |
| `INVALID_DATE` | `LOT_DATE_INVALID` | The encoded date is not a calendar date |
| `INVALID_DATE` | `SUPPLIED_DATE_INVALID` | The system cannot read the supplied date, or the supplied date is not a calendar date |

7. Only a `CREATED` row writes a LOT. A conflict reaches a person through the
   report. If the LOT is correct, the person registers it on the product page
   (CAT-40).
8. A commit creates the import with `PROCESSING` and ends it with
   `COMPLETED` in the same transaction. `COMPLETED` means that the import
   ended, not that the import created each row. If the commit stops with an
   error, the database first does a rollback of the transaction. Then the
   system records the import as `FAILED`, with the code of the error.
9. The system keeps the SHA-256 of the input. A preview shows a warning when an
   earlier import had the same hash. The system still allows the commit.
10. A row keeps the imported cells as they arrived, before transport cleanup.
    A row keeps no other cell of the sheet. The stored LOT number follows
    DEC-043.
11. Each commit writes one `AUDIT` record with its counts (PLT-40). The
    system never deletes an import or a row (DEC-010).
12. A fault of the request follows DEC-013:
    - No text and no file is `VAL-4001`.
    - An unreadable input, a column that is not in the input, no data rows and
      more than 5,000 data rows are `VAL-4006`. The answer has a `details`
      entry for each fault.
    - A body over 5 MiB is 413 `VAL-4550`.

**Data.** `catalog_lot_import`: `source_filename` (optional; empty for pasted
text), `source_hash`, `product` (optional), `uploaded_by`, `status`
(`PROCESSING`, `COMPLETED` or `FAILED`), `row_count`, `created_count`,
`existing_count`, `conflict_count`, `invalid_count`, `failure_code` (only
when `FAILED`), `completed_at`. Constraint `lot_import_counts_add_up`: the sum
of the four counts of a `COMPLETED` import is `row_count`.
`catalog_lot_import_row`: `lot_import`, `row_number` (from 1, as in the
source), `outcome`, `reason`, `raw_cells` (JSONB), `lot` (optional).
Constraint `lot_import_row_unique`: `UNIQUE (lot_import_id, row_number)`.

**Screens.**
- Backoffice › LOT import: the paste field, the file field, the choice of one
  product, the preview grouped by product, and the commit. The preview shows
  the outcome of each row.
- Backoffice › LOT imports: the list and the report of each import.

**Acceptance.**
- **AC1.** When a preview reads 3 new rows, its plan shows 3 `CREATED` rows,
  and the number of LOTs does not change.
- **AC2.** When a commit reads 3 new rows, 3 LOTs exist, and each LOT names the
  import. The import is `COMPLETED` with `createdCount` 3. One `AUDIT` record
  holds the counts.
- **AC3.** When a row names a registered LOT with the same catalog number and
  the same date, its outcome is `ALREADY_EXISTS` with `LOT_ALREADY_EXISTS`.
  The import writes nothing for the row.
- **AC4.** When a row names a registered LOT with another supplied date, its
  outcome is `CONFLICT_REVIEW_REQUIRED` with `DATE_DIFFERS_FROM_REGISTERED`.
  The import writes nothing, and the registered LOT keeps its date.
- **AC5.** When a row's supplied date differs from its encoded date, its
  outcome is `CONFLICT_REVIEW_REQUIRED` with `SUPPLIED_DATE_CONFLICT`. The
  import writes nothing for the row.
- **AC6.** When two rows name the same catalog number and LOT with different
  dates, both rows get `CONFLICTING_ROWS`, and the import writes neither row.
- **AC7.** When a row names a catalog number that does not exist, its outcome
  is `INVALID_CATALOG_NUMBER` with `CATALOG_NUMBER_NOT_FOUND`.
- **AC8.** When a LOT cell is `" B2603091224GHPVV "`, the stored LOT number is
  `B2603091224GHPVV`, and the row's raw cells keep the spaces.
- **AC9.** When a CSV in Windows-1254 has the header `Üretim Tarihi`, the
  system reads that column as the manufacturing date.
- **AC10.** If the input has 5,001 data rows, the preview fails with 400
  `VAL-4006`, and the system records no import.
- **AC11.** If the request body is larger than 5 MiB, the answer is 413
  `VAL-4550`.
- **AC12.** If a LOT with the date of a row appears between the preview and
  the commit, the commit gives the row `ALREADY_EXISTS` with
  `LOT_ALREADY_EXISTS`.
- **AC13.** If a LOT with another date appears between the preview and the
  commit, the commit gives the row `CONFLICT_REVIEW_REQUIRED` with
  `DATE_DIFFERS_FROM_REGISTERED`.
- **AC14.** When the commit stops with an error after it started, no LOT of
  that commit exists. An import with the status `FAILED` and an error code
  exists.
- **AC15.** When an earlier import had the same input hash, the preview shows
  a warning, and the commit succeeds.
- **AC16.** When an import for one product has a row that names another
  product's catalog number, the row's outcome is `INVALID_CATALOG_NUMBER` with
  `OTHER_PRODUCT`.
- **AC17.** When the supplied dates are `2026-03-09`, `09.03.2026` and
  `09/03/2026`, the system reads each as 9 March 2026.
- **AC18.** When the input has no header and two columns, the system reads the
  first column as the catalog number. It reads the second column as the LOT
  number.
- **AC19.** If the input has a header row without a LOT column, the preview
  fails with 400 `VAL-4006`, and `details` names the field `lotNumber`.
- **AC20.** If the file is not a readable XLSX, CSV, TSV or text file, the
  preview fails with 400 `VAL-4006`. Its `details` names the field `file`.

**Trace.** eng/eifu-imports.md; eng/state-machines.md §ImportBatch; eng/data-model-fields.md §ImportBatch; audit D-4, D-9

### CAT-61 Import template

**Rules.**
1. The download needs the permission of DEC-057. The file follows DEC-055.

**Acceptance.**
- **AC1.** When a person downloads the import template, the file is an XLSX
  file. Its first sheet holds only the header row, with the labels in the
  active language. The catalog number column and the LOT column of that sheet
  have the text format. Its second sheet holds the instructions.
- **AC2.** If a person uploads the template without data rows, the preview
  fails with 400 `VAL-4006`.
