# ADR-0012: Product identity derived from the catalog master

- **Status:** Accepted
- **Date:** 2026-08-26
- **Proposed:** 2026-08-26 by Engineering, from analysis of `BKSNproducts.xlsx`
- **Accepted:** 2026-08-26 by the project technical lead
- **Technical owner:** Engineering
- **Business owner:** Bioeksen product management

## Context

Bioeksen supplied a catalogue export: 573 catalog numbers with pack size,
format, and Turkish and English names, plus 178 sample lot records.

The sheet has no product column. It is a list of catalog numbers, and our
domain model needs `Product` — the canonical identity that e-IFU and Academy
share — with `CatalogNumber` hanging off it. So the grouping had to be
established, and it is a business decision rather than a derivation.

## Decision

### A product is a catalog stem plus its regulatory status

Strip the trailing size token from the catalog number; keep everything else,
including the `L` / `S` / `T` marker. Split IVD from RUO.

    BS-STI-L-100  ┐
    BS-STI-L-25   ┘→  product BS-STI-L        two pack sizes, one product
    BS-STI-S-25   →   product BS-STI-S        a different product
    BS-STI-L-24R  →   product BS-STI-L (RUO)  a different product again

**573 catalog numbers become 322 products.** Of the 187 products holding more
than one catalog number, 180 have identical names across them; the 7 that
differ are spelling variants in the source, not disagreements
(`sars cov-2` / `sars-cov-2`, `kit` / `kiti`, `virüsleri` / `virüsü`).

### Format belongs to the catalog number, not the product

Format — vCAP, lyophilized, liquid — varies *within* 14 of the 322 products, so
it cannot sit on `Product`. `BS-HP` settles it: `BS-HP-25` is vCAP while
`BS-HP-25R` and `BS-HP-100R` are liquid.

That same product also carries two different LOT kit codes, `HPV` and `HP`,
which is not a coincidence — see ADR-0013.

### Each format has its own IFU

Confirmed by Bioeksen. `BS-STI-L` and `BS-STI-S` do not share a document, so
applicability is created per product and no sharing shortcut is built.

### RUO comes from the sheet's row order, for now

Rows from `BS-SY-SI-100R` onward are RUO. Deriving it any other way fails:

- The catalog number is unreliable — an `R` suffix predicts RUO only 76% of the
  time. 96 catalog numbers end in `R` and are not RUO.
- The product name is worse — 96 RUO products do not carry `(RUO)` in their
  name, so parsing it would have silently classified them as IVD.

**Row order is not a data field.** Re-sorting, re-exporting or inserting a
product loses the boundary with no error. It is used for this import because it
is the only correct signal available; the export needs an explicit column
before the next one. IVD versus RUO is a regulatory distinction and should not
depend on position in a spreadsheet.

### An Academy course links to many products; there is no family level

The granularity above is right for e-IFU, where format and regulatory status
both change the applicable document. It is deliberately finer than training
needs: one "STI panel" course covers up to six products.

A course therefore references the products it applies to, chosen when the
course is authored. No product-family level is introduced.

Adding a level above `Product` would put a second identity beside the one
`domain-model.md` calls canonical, and a second identity leaks — e-IFU would
eventually have to decide which level applicability attaches to. A
many-to-many from course to product states the same fact ("this course covers
these products") without that risk, and is a table rather than a hierarchy if
it turns out to be wrong.

Not built yet: Academy does not exist. Recorded here because the granularity
decision is what forces the question, and answering it later would mean
answering it under pressure.

## Consequences

### Positive

- One canonical identity, as the domain model requires.
- Applicability stays product-level (ADR-0005) with no exception.
- Pack size remains catalog-number metadata that is never parsed, which the
  data supports: the trailing number in the catalog number disagrees with the
  pack-size column in 111 of 553 rows.

### Negative / accepted costs

- 322 products need 322 sets of IFU documents. Bioeksen confirmed formats do
  not share, so this is real work rather than an artefact of the grouping.
- RUO classification depends on row order until the export carries a column.
  This is recorded as a known fragility, not a solved problem.
- The 7 name conflicts need a decision per product, or a rule such as
  "the first catalog number's name wins". They are listed for correction at
  source, which is the better fix.

### Follow-up required

- [ ] An explicit IVD/RUO column in the catalogue export.
- [ ] The 7 name spelling conflicts corrected at source.
- [ ] GHS / TGHS / VGHS products added to the catalogue export — 37 lot records
      reference products that are not in it (animal and food health lines).

## Alternatives considered

- **One product per catalog number.** Rejected: 573 products where 322 exist,
  and pack size would become an identity rather than an attribute.
- **Ignore the L/S/T marker, group by assay.** Rejected by Bioeksen: those are
  different products, and they carry different formats and different IFUs.
- **Derive RUO from the name or the catalog number.** Rejected on the evidence
  above: both misclassify 96 products.
- **A product-family level above `Product`.** Rejected; see the course section.
