# Bioeksen Portal — Specifications

**Release 1: e-IFU — the correct Instructions for Use for each product and LOT**

Version 1, 20 October 2026

These files are the only authority for the build of Bioeksen Portal release 1.
They give the decisions, the items to make and the method for each item. You
do not need another file to build from them.

Release 2 (Academy, the training platform) is in `academy.md` as an outline.
Its decisions are in force. Its items get their full detail before stage B6
starts.

The text follows ASD-STE-100 (Simplified Technical English).

## Files

| File | Contents |
|---|---|
| `README.md` | How to use the files, the build order, the open decisions and the glossary |
| `core.md` | The decisions of scope, architecture, data, interface and access; the foundation (FND), identity and access (ACC) and the platform services (PLT) |
| `catalog.md` | The decisions and the items `CAT` of the product catalog: products, catalog numbers, LOTs and LOT imports |
| `eifu.md` | The decisions and the items `IFU` of e-IFU: documents, publication, the public lookup, access records and personal data |
| `academy.md` | The decisions and the outline items `ACD` of the Academy (release 2) |

**Where to find an ID.**
- The items `FND`, `ACC` and `PLT` are in `core.md`.
- The items `CAT` are in `catalog.md`.
- The items `IFU` are in `eifu.md`.
- The items `ACD` are in `academy.md`.
- Each decision is in the file of its subject:
  - `core.md`: DEC-001 to DEC-039; DEC-120 to DEC-138.
  - `catalog.md`: DEC-040 to DEC-057.
  - `eifu.md`: DEC-060 to DEC-085; DEC-087 to DEC-096.
  - `academy.md`: DEC-100 to DEC-112.
- A new decision takes the next free number of its file's block. The free
  numbers are 139 for `core.md`, 058 and 059 for `catalog.md`, 097 to
  099 for `eifu.md` and 113 to 119 for `academy.md`. Change the list above
  when you add a decision. Do not use the number 086 again.

## How to use the files

**Authority.**
- These files have priority over all other texts.
- Each decision is a `DEC` row in these files. No other file holds a decision.
- If these files do not give a rule, ask the product owner. Do not take the
  rule from another file.
- `docs/old_specs/` holds the documents that these files replace. These
  documents are the old ADRs, the documents in `engineering/`, the runbooks,
  the design reference and the audit of 20 October 2026. They show the
  history only. Do not build from them.
- The `bioeksen-sds` skills are the shared contracts. These files use them as
  a base and do not repeat them. Each departure from a skill is a decision
  row. The row names the section of the skill and says what ends the
  departure.

**Identifiers.**

| Form | Meaning |
|---|---|
| `DEC-nnn` | A decision, in the "Decisions" section of its file |
| `FND-nn` | A foundation item: the repository, the configuration, the standard endpoints, the log records, the data layer, security and the interface base |
| `ACC-nn` | An identity and access item: users, sign-in, roles and permissions |
| `PLT-nn` | A platform service item: file storage, mail, scheduled jobs, audit, backups and operational signals |
| `CAT-nn` | A product catalog item |
| `IFU-nn` | An e-IFU item |
| `ACD-nn` | An Academy item (release 2) |
| `<item>.ACn` | The acceptance criterion *n* of an item, for example `IFU-60.AC3` |

The build items have numbers in groups of ten. The first number of a group
(for example `IFU-30`) is the main item of a subject. The other numbers of the
same group (for example `IFU-31`) are parts of that subject. An item whose
group has no main item (for example `FND-01`) is an independent item. All IDs
are unique across the files. Do not use an ID again, also after you remove its
row or item.

**How to read a build item.**
- **What.** is what the item gives. **Rules.** are the rules, with the
  decisions that they carry. **Data.**, **Screens.**, **States.**, **Moves.**
  and **Jobs.** give the details where the item needs them.
- **Acceptance.** gives the acceptance criteria. The tests come first, from
  the acceptance criteria, as `sds-testing` says in **Acceptance tests**.
- In the acceptance criteria of a group, the first paragraph of the group
  defines the word "fails".
- A part (for example `IFU-31`) shares the **What.** and the **Rules.** of its
  main item, and adds its own where it needs them.
- The criteria name the API fields in camelCase (`isActive`) and the database
  objects in snake_case (`anonymized_at`), as each appears to the test.

**Decision status.**

| Status | Meaning |
|---|---|
| **Decided** | The owner of the decision made it. Build it. |
| **Pending** | The owner must answer a question. The rule in the row is in force until the answer comes. The **Ask** column names the question. |
| **Default** | We made this choice. It is in force, and we can change it. |

**Owners.**
- `PO`: the product owner (Bioeksen project ownership).
- `QA`: the Bioeksen quality function.
- `LEG`: the Bioeksen legal function.
- `PM`: Bioeksen product management, the owner of the product catalog.
- `IT`: the infrastructure and operations team.
- `SDS`: BioEksen Ar-Ge, the owner of the `bioeksen-sds` standards.
- `ENG`: the team of engineers.

**The Ask column.**
- `questions.md n` names the question that the owner answers. The file is
  `/docs/questions.md`. It is in Turkish, because the owners read Turkish.
- On a *Decided* row, the question asks the owner that it names to confirm
  the decision. That owner can be different from the owner of the row. For
  example, `PO` decided a retention period, and `LEG` confirms that the
  period is lawful. The decision stays in force.
- `—` shows that nobody asks a question.

**The Trace column and the Trace lines.**
- They name the old source of a rule in `docs/old_specs/`:
  - `adr/0008` is an old ADR.
  - `eng/…` is a file of the old `engineering/` folder.
  - `ops/…` is an old runbook.
  - `audit X-n` is a finding of `audits/2026-10-20-scaffold-audit.md`.
- An owner answer gives its date.
- They show the history only. You do not need them for the build.

**How to change a decision.**
1. Change the `DEC` row: the rule and the **Status**. An answer makes a
   *Pending* row *Decided*.
2. Remove the row from the *Open decisions* list below.
3. Change the build items in its **Affects** column and their acceptance
   criteria.
4. Change the tests that cite those criteria.

**Tests and code.**
- Each test cites the acceptance criterion that it proves, for example
  `IFU-60.AC3`, at the start of its title.
- A code comment cites the build item or the decision that the code
  implements, for example `IFU-60` or `DEC-061`.
- A build item is complete when each of its acceptance criteria has a test
  that passes.
- Check the set with the `sds-planning` checker:
  `python <sds-planning>/scripts/check_specs.py --specs docs/specs`.

**Names.**
- The code, the data, the API fields, the error codes, the log text and the
  state codes are in English. Spell their words as in American English.
- The interface shows the Turkish and English labels from the dictionaries.
  These files give the Turkish label in italics where the users see it.
- The API bodies use camelCase field names (`catalogNumber`), as
  `sds-api-design` says. The tables and the columns use snake_case, with the
  name of the module as the prefix of each table (`catalog_lot`).

## Build order

The engines come first, so that no later item needs a workaround for an
engine that is not there. Identity and the platform services come before the
catalog, because the system authorizes and audits every write. The catalog
comes before the documents, because a document applies to a product. The
public lookup comes last in release 1, because it reads everything before it.

An item whose criteria need a later stage names its parts. Its criteria in
parentheses are due in the stage that lists them. The stages follow their
dependencies, not dates. A stage is complete when its exit criterion passes
and each acceptance criterion due in it has a test that passes.

```
B0 Foundation
 └─ B1 Identity and platform services
     └─ B2 Product catalog
         └─ B3 Documents and publication
             └─ B4 Public lookup
                 └─ B5 Personal data and operations      (release 1 ends)
                     └─ B6 Academy foundation             (release 2)
                         └─ B7 Learning
                             └─ B8 Certificates and Training Studio
```

| Need from IT | For | First needed in |
|---|---|---|
| A CI runner for the pull request pipeline | FND-02 | B0 |
| A test environment in Türkiye with Docker, and the deploy repository (DEC-128). The demo of DEC-135 stands in until then | FND-02 | B5 |
| PostgreSQL 16 and Redis 7 for the test environment | FND-04, FND-06, ACC-20 | B5 |
| The values of `sds-auth` (`credentials.md`, **Configuration**) for this app, and `TRUSTED_PROXIES`. The demo runs without them (DEC-135) | FND-03, FND-04 | B5 |
| An SMTP relay in Türkiye with STARTTLS, and a sender address | PLT-20 | B1 |
| An S3-compatible object store in Türkiye, and an access key limited to the buckets of the app. The store refuses a write with `If-None-Match: *` to a key that exists | PLT-10 | B1 |
| The production host, its TLS proxy and its public host name | IFU-70 | B4 |
| Two named key custodians | IFU-90 | B4 |
| An off-host backup bucket in Türkiye, and the uptime check and the alerts of DEC-034 | PLT-60, PLT-70 | B5 |

| Need from PM, QA and LEG | For | First needed in |
|---|---|---|
| PM: the product master (catalog numbers, names, formats, regulatory status) and the kit code base of each product | CAT-10, CAT-20, CAT-50 | B2 |
| PM: the LOT export, for the first import | CAT-60 | B2 |
| QA: the IFU files and the effective date of each version, for each product | IFU-10, IFU-30 | B3 |
| LEG: the consent text of the public lookup | IFU-50 | B4 |

| Stage | Items | Exit criterion |
|---|---|---|
| **B0 Foundation** | FND-01, FND-02 (AC1, AC2, AC3, AC5), FND-03, FND-04 (AC1 to AC4), FND-05 (AC1, AC2, AC3, AC5), FND-06 (AC1, AC2), FND-07 (AC1, AC2, AC4, AC5), FND-08 (AC1 to AC4, AC6), FND-09 (AC2) | CI runs every check of FND-02 on a pull request. The demo of DEC-135 starts from `compose.demo.yaml`, and there `GET /api/health/ready` answers 200. The `sds-planning` checker passes on this set. |
| **B1 Identity and platform services** | FND-04 (AC5), FND-07 (AC3), FND-08 (AC5), PLT-40, PLT-20, ACC-10, ACC-20, ACC-30 (AC1, AC3, AC4), ACC-40, PLT-10, PLT-30, ACC-50 (AC1, AC2) | The first Platform Administrator gets an invitation, sets a password, completes the sign-in, invites a second user and grants the IFU Manager role. Each grant has its audit record. |
| **B2 Product catalog** | FND-09 (AC3), CAT-10, CAT-20, CAT-30, CAT-40, CAT-50, CAT-60 | An IFU Manager enters a product with two catalog numbers, imports LOTs with a row report, and corrects a LOT whose dates disagree. |
| **B3 Documents and publication** | IFU-10, IFU-20, IFU-30, IFU-40 | An IFU Manager publishes three versions of one document, replaces a published file, withdraws a version and sets an override. The periods match IFU-30. |
| **B4 Public lookup** | FND-05 (AC4), FND-06 (AC3, AC4, AC5), FND-09 (AC1, AC4), ACC-50 (AC3), IFU-90, IFU-50, IFU-60, IFU-80, IFU-70 | A visitor proves an email address with the emailed code and gets the files of the correct version. The public endpoints pass the fixture of IFU-60. Each lookup has its access record, which holds the encrypted identity. |
| **B5 Personal data and operations** | FND-02 (AC4), ACC-30 (AC2), IFU-81, IFU-82, IFU-83, IFU-84, IFU-91, PLT-60, PLT-70 | The retention pass anonymizes the records that are older than the period. An erasure request clears a person's records. A backup restores into an empty database. A failed mail send shows in the log records that the alerts read. Each permission has its two tests. Release 1 is complete. |
| **B6 Academy foundation** | ACD-10, ACD-20, ACC-60 | Release 2: the outline items of `academy.md` have their full detail. A course version moves from `DRAFT` to `PUBLISHED` with the approval of a second person. |
| **B7 Learning** | ACD-30, ACD-40, ACD-50 | A learner with an assigned course completes its lessons and passes its assessment. |
| **B8 Certificates and Training Studio** | ACD-60, ACD-70, ACD-80 | A learner gets a certificate that verifies publicly. An author builds a course in the Training Studio. |

**Crisis mode.** While DEC-136 is in force, B1 to B4 follow the loop of
`crisis_mode.md`. The test phase of B0 to B4 follows B4. B5 follows the test
phase.

**The B1 order.** As the table lists it: the audit records and the mail come
first, because the creation of a user needs both.

**The B4 order.** As the table lists it. IFU-90 comes first, because the
verification and the access records need its identity protection. Then
IFU-50, IFU-60, IFU-80 and IFU-70 follow.

## Open decisions

This list shows the decisions that an owner must still answer. The decisions
are in the order of the first stage that needs the answer. The rule in force, the owner and the
question are in the row of the decision.

| Decision | First needed in |
|---|---|
| DEC-013 | B0 |
| DEC-021 | B0 |
| DEC-135 | B0 |
| DEC-039 | B2 |
| DEC-040 | B2 |
| DEC-044 | B2 |
| DEC-046 | B2 |
| DEC-047 | B2 |
| DEC-048 | B2 |
| DEC-050 | B2 |
| DEC-060 | B3 |
| DEC-067 | B4 |
| DEC-068 | B4 |
| DEC-073 | B4 |
| DEC-074 | B4 |
| DEC-075 | B4 |
| DEC-083 | B4 |
| DEC-132 | B4 |
| DEC-034 | B5 |
| DEC-128 | B5 |
| DEC-035 | B5 |
| DEC-036 | B5 |
| DEC-082 | B5 |
| DEC-084 | B5 |
| DEC-037 | B6 |
| DEC-108 | B7 |
| DEC-109 | B7 |

## Glossary

Each term has one meaning.

*Ürün* — **Product**: a `catalog_product` row. It is the one product identity
that e-IFU and the Academy share (DEC-001, DEC-040). Never use "kit" or "item"
for it in data.

*Kök kod* — **Stem**: the catalog number without the size token at its end,
for example `BS-STI-L`. With the regulatory status, it identifies a product
(DEC-040).

*Katalog numarası* — **Catalog number**: a `catalog_catalog_number` row, for
example `BS-GHPV-L-100`. It belongs to one product (DEC-042). Never use
"CAT No", "reference code" or "catalogue number" for it in data.

*Format* — **Format**: the physical form of a catalog number: `VCAP`,
`LYOPHILIZED` or `LIQUID` (CAT-20).

*Regülasyon durumu* — **Regulatory status**: `IVD` or `RUO`. It is part of
the identity of a product (DEC-040).

*LOT numarası* — **LOT number**: the business identifier of a production
batch, for example `B2603091224GHPVV`. The system stores the value as it
receives it, after the transport cleanup (DEC-043).

*Üretim tarihi* — **Manufacturing date**: the date that a LOT number encodes,
or that an approved source supplies. It selects the document version
(DEC-061).

*Kit kodu* — **Kit code**: the end of a LOT number that identifies the kit.
The system verifies it and never extracts it (DEC-048).

*Taşıma temizliği* — **Transport cleanup**: the removal of the characters that
a value gets in transit. Examples are a BOM, spaces at the ends and quotes
from a CSV export.
It never changes what a value means (CAT-30).

*Kullanım talimatı* — **IFU** (Instructions for Use): the regulated document
of a product. It is the only document type of the portal (DEC-120).

*Doküman* — **Document**: an `eifu_document` row: one IFU of one product,
with its document number from the quality system (IFU-10).

*Revizyon* — **Document version**: an `eifu_document_version` row: one
version of a document, with its files (IFU-10). Its revision label (`03`)
names it, so "the version `03`" is the document version with that label.

*Geçerlilik dönemi* — **Applicability period**: an `eifu_applicability` row:
the product, the version, `effectiveFrom` (inclusive) and `effectiveTo`
(exclusive) (IFU-30).

*LOT yönlendirmesi* — **Override**: an `eifu_lot_override` row that binds one
LOT to one version, with a reason (IFU-40).

*Ziyaretçi* — **Visitor**: a person who uses the public lookup without an
account.

*Kamuya açık sorgu* — **Public lookup**: the whole flow of a visitor: the
verification, then the lookup (DEC-070).

*Doğrulama* — **Verification**: the first step of the public lookup. It holds
the inputs and sends a six-digit code to the email address (IFU-50).

*Doğrulama kodu* — **Verification code**: the six-digit code of a
verification (IFU-51).

*Sorgu* — **Lookup**: the second step of the public lookup. It checks the code
and resolves the document version (IFU-60).

*Sonuç* — **Outcome**: the result of a lookup, for example `RESOLVED` or
`LOT_NOT_FOUND` (IFU-60). Each access record stores it.

*Erişim kaydı* — **Access record**: an `eifu_access_record` row: one lookup,
with its inputs, its outcome and the protected identity of the visitor
(IFU-80).

*Aydınlatma metni* — **Consent text**: the legal text that a visitor accepts
before the system sends the code. It has a version, which the API calls
`noticeVersion` (DEC-074).

*E-posta adresi* — **Email address**: the address that receives the
verification code. Never use "address" alone for it.

*İstemci adresi* — **Client address**: the IP address of the visitor, as
DEC-038 finds it. The **source address** of a rate limit is the same value.

*Anonimleştirme* — **Anonymization**: the operation that clears the identity
fields of an access record. The row stays (DEC-080).

*İçe aktarma* — **LOT import**: a `catalog_lot_import` row and its row
results (CAT-60).

*Arka ofis* — **Backoffice**: the staff area for the catalog and the documents.
It needs a sign-in.

*Kullanıcı* — **User**: an `identity_user` row. One person has one user
(DEC-023).

*Rol* — **Role**: a named set of permissions (DEC-029).

*Yetki* — **Permission**: a code in the form `<domain>.<resource>.<action>`,
for example `eifu.document.publish` (ACC-30).

*Akademi* — **Academy**: the training area of release 2 (`academy.md`).
