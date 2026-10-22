# ADR-0009: Localized authored content stored as per-locale JSONB

- **Status:** Accepted
- **Date:** 2026-08-22
- **Deciders:** Engineering

## Context

`localization.md` distinguishes two kinds of text: static UI strings, which use
translation keys, and **authored business content** — course titles, lesson text,
question prompts, feedback — which is data entered by content authors in Training
Studio and must exist per locale.

Initial locales are `tr` and `en`. e-IFU already handles German document files,
so a third UI locale is plausible.

## Decision

Authored content columns are JSONB holding one entry per locale:

```json
{ "tr": "Kullanım Talimatı", "en": "Instructions for Use" }
```

- Allowed locale keys and required locales are validated at the application
  boundary, and required-locale presence is enforced by a database check
  constraint.
- A missing required locale returns `LOCALIZED_CONTENT_INCOMPLETE` and blocks
  `DRAFT -> IN_REVIEW` (`state-machines.md`).
- Static UI strings never use this mechanism.

## Consequences

### Positive

- Adding a locale is a configuration and content change, not a migration across
  every content-bearing table.
- Authoring a record in both languages is one row, so Training Studio's
  side-by-side editing maps directly onto the storage model.
- Content, its translations and its version move together atomically.

### Negative / accepted costs

- Weaker column-level typing than suffixed columns. Mitigated by boundary
  validation and check constraints.
- Querying or sorting by a localized field needs a JSONB path expression and a
  functional index where it matters.
- Full-text search over authored content requires per-locale expression indexes.

## Alternatives considered

- **Suffixed columns (`title_tr`, `title_en`).** Rejected: every new locale is a
  migration touching every content table, and the column set encodes the locale
  list in the schema.
- **A separate translation table per entity.** Rejected: a join for every text
  field on every content read, for a two-locale system with no independent
  translation workflow.
- **`django-modeltranslation` or similar.** Rejected under `dependencies.md`: it
  solves the suffixed-column problem with runtime schema manipulation, which
  makes migrations harder to reason about.
