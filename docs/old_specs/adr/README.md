# Architecture Decision Records

An ADR records a decision that is expensive to reverse, together with the reason
it was made. Documentation elsewhere says *what* the rules are; ADRs say *why*,
so that a future change is a revision rather than a rediscovery.

## When an ADR is required

- Changing a fixed platform decision in `SKILL.md`.
- A major upgrade of Node, NestJS, Prisma, PostgreSQL or React.
- Adding a dependency that receives project or personal data.
- Changing a canonical domain rule — for example moving IFU applicability from
  product-level to CAT-level.
- Adding a service boundary, a channel, or a new storage system.
- Any decision the documentation defers with "requires an approved architecture
  decision".

## Who decided, and did they really

An ADR names owners, and the naming must be true.

- **Technical owner** — engineering. Always us.
- **Business owner** — the function whose requirement this serves: quality,
  legal, commercial.
- **Deciders** — only people who actually reviewed and decided. Naming a function
  as a decider when it has not seen the record asserts an approval that did not
  happen, and an unearned approval is worse than an open question, because nobody
  goes back to check it.

Where engineering is building to a stated requirement that the owning function
has not formally signed off, use `Accepted for implementation` with an **Approval
provenance** section saying exactly what is outstanding. ADR-0005 and ADR-0006 are
the models. ADR-0007 is the model for a decision engineering may not make at all.

## Process

1. Copy `0000-template.md` to the next number.
2. Open it as `Proposed` in the PR that needs it.
3. Merge as `Accepted` once agreed. An ADR is never edited after acceptance —
   it is superseded by a new one that references it.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith over microservices | Accepted |
| [0002](0002-monorepo.md) | Monorepo | Accepted |
| [0003](0003-session-based-authentication.md) | Django session cookies for Academy authentication | Accepted — decision stands, Django-specific implementation obsolete per ADR-0015 |
| [0004](0004-vite-react-spa.md) | Vite + React SPA, no SSR framework | Accepted |
| [0005](0005-product-level-ifu-applicability.md) | IFU applicability is product-level | Accepted for implementation — quality approval pending |
| [0006](0006-data-residency-turkey.md) | Production data resides in Türkiye | Accepted for implementation — legal approval pending |
| [0007](0007-personal-data-retention.md) | Retention of e-IFU personal access data | Accepted for implementation — **period superseded by ADR-0016**; its open legal questions still stand |
| [0008](0008-lot-date-parsing.md) | Bioeksen LOT manufacturing-date parsing | Accepted for implementation — quality confirmation pending |
| [0009](0009-localized-content-storage.md) | Localized authored content stored as per-locale JSONB | Accepted |
| [0010](0010-design-tokens-from-brand.md) | Design tokens derived from the brand mark | Accepted |
| [0011](0011-one-sign-in-two-entrances.md) | One sign-in, two entrances | Accepted |
| [0012](0012-product-identity-from-the-catalog-master.md) | Product identity derived from the catalog master | Accepted |
| [0013](0013-lot-kit-code-verified-not-extracted.md) | The LOT kit code is verified, never extracted | Accepted |
| [0014](0014-bioeksen-shared-standards.md) | BioEksen shared standards, and where this app keeps its own error codes | Accepted |
| [0015](0015-typescript-backend.md) | The backend is TypeScript on NestJS, rebuilt rather than ported | Accepted |
| [0016](0016-indefinite-retention-with-erasure-on-request.md) | Indefinite retention of e-IFU access identifiers, with erasure on request | Accepted for implementation — legal review pending; **period superseded by ADR-0018** (ten years); its erasure-on-request mechanism stands |
| [0017](0017-identity-encrypted-not-hashed.md) | e-IFU access identities are encrypted, not hashed | Accepted for implementation — the condition ADR-0016 rests on; legal review pending |
| [0018](0018-verified-address-and-ten-year-retention.md) | The address is proved before the document, and kept for ten years | Accepted for implementation — supersedes ADR-0016's period; consent text is a draft; legal review pending |
| [0019](0019-embedded-video-behind-a-cover.md) | Course video is embedded from YouTube or Vimeo, behind a cover | Accepted for implementation — a bounded exception to ADR-0006; Academy consent text outstanding |
