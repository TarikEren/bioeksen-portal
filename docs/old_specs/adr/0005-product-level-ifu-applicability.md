# ADR-0005: IFU applicability is product-level

- **Status:** Accepted for implementation
- **Date:** 2026-08-22
- **Technical owner:** Engineering
- **Business owner:** Bioeksen quality function
- **Formal quality approval:** pending — see *Approval provenance*

## Approval provenance

The business premise here — that all catalog numbers for one product share the
same IFU — was stated as a requirement during project definition. Bioeksen's
quality function has **not** formally reviewed or signed off this record.

The distinction matters: a decision reached in a requirements conversation is
enough to build on, and is not the same as a documented quality approval. Naming
quality as a *decider* would assert an approval that did not happen.

Implementation proceeds on this basis. Before production release, confirm the
premise with quality and update this section.

## Context

A `Product` may have several `CatalogNumber` records, typically differing by pack
size or commercial configuration. Bioeksen's current reality is that all catalog
numbers for one product share the same IFU.

The alternative — CAT-level applicability — is strictly more expressive and
strictly more expensive: more rows, more resolution paths, more ways to
misconfigure a safety-critical lookup.

## Decision

`DocumentApplicability` binds a `DocumentVersion` to a `Product` with an
effective period. It does not reference `CatalogNumber`.

A LOT resolves: `Lot -> CatalogNumber -> Product -> applicable DocumentVersion`,
selected by `manufacturing_date` against effective periods.

## Consequences

### Positive

- One resolution path, therefore one thing to test exhaustively.
- Adding a pack size cannot silently change which IFU a product resolves to.

### Negative / accepted costs

- If Bioeksen ever ships different IFUs for different pack sizes of one product,
  this requires a schema change and a new ADR — not a configuration change.

### Follow-up required

- The `LotDocumentOverride` escape hatch covers the individual exceptional case
  without changing the model. If overrides start being used systematically for
  one catalog number, that is the signal to revisit this ADR.

## Alternatives considered

- **CAT-level applicability.** Rejected as premature: it prices in a distinction
  the business does not currently make, and doubles the surface of a
  safety-critical resolver.
