# ADR-0008: Bioeksen LOT manufacturing-date parsing

- **Status:** Accepted for implementation
- **Date:** 2026-08-22
- **Technical owner:** Engineering
- **Business owner:** Bioeksen quality function
- **Formal quality approval:** pending — the LOT format rule was supplied as a
  requirement but has not been formally confirmed as stable by quality

## Context

Bioeksen LOT numbers currently encode a manufacturing date after the leading `B`:
`B2603091224GHPVV` -> `260309` -> `YYMMDD` -> 2026-03-09.

Deriving business meaning from an identifier is normally a design smell. Here it
is a documented business rule, and the manufacturing date is what e-IFU
resolution depends on (ADR-0005), so it must be parsed. The risk is that the
format changes and the parse becomes silently wrong.

## Decision

1. The LOT string is stored as the business identifier, subject to a strict
   two-tier rule:

   **Transport cleanup — allowed, once, at the import boundary.** Surrounding
   whitespace (including tabs and non-breaking spaces), a UTF-8 BOM, and quote
   characters added by a CSV exporter are artefacts of how the value travelled,
   not part of the value. `" B2603091224GHPVV "` is stored as
   `"B2603091224GHPVV"`. The raw cell is retained in `ImportRowResult.raw_row`.

   **Semantic normalization — forbidden.** No case conversion, no separator
   removal, no internal whitespace rewriting, no zero-padding, no truncation, no
   character substitution. `b2603091224ghpvv` fails as
   `EIFU_LOT_FORMAT_INVALID`; it is not promoted to upper case.

   The test is which question the transformation answers. Stripping a leading
   space answers "what did the file contain". Upper-casing answers "what did they
   probably mean" — and inferring intent about the identifier that selects a
   regulatory document is not a job for the import layer.
2. The date is parsed into a separate `manufacturing_date` column.
3. Parsing lives in exactly one tested function. No substring arithmetic anywhere
   else in the codebase.
4. `Lot.manufacturing_date_source` records provenance: `PARSED_FROM_LOT`,
   `SUPPLIED`, or `MANUAL_CORRECTION`.
5. Impossible dates are rejected (`EIFU_LOT_DATE_INVALID`), never coerced.
6. When an approved source supplies a manufacturing date that disagrees with the
   parsed one, **neither wins automatically**: `has_date_conflict` is set, the row
   is flagged `CONFLICT_REVIEW_REQUIRED`, and resolution returns
   `EIFU_LOT_DATE_CONFLICT` until a human resolves it with an audited correction.
7. Two-digit years map to `2000 + YY`. The century window is a named constant
   with a comment, not an inline literal.
8. **The tail ends with a kit code.** In `1224GHPVV`, `GHPVV` identifies the
   kit and what precedes it carries no meaning we act on.

   Note that "the letters are the code" is *not* the rule, though it looked
   like one from a single example. Digits can sit inside a code — `KKEV1V` and
   `KKEV2V` are two different panels — and trailing digits after it are batch
   noise. **ADR-0013** establishes the rule properly, from 178 real lot
   records: the code is a product-specific base plus a letter determined by the
   catalog number's format. The base cannot be derived and is
   administrator-maintained data; the letter can be.

   It is verified by suffix match, never parsed out, because a base ending in
   `V` and a vCAP marker cannot be told apart from outside. See ADR-0013.

   The import boundary gains a second, independent check: a LOT whose kit code
   disagrees with the product its catalog number resolves to is flagged
   `CONFLICT_REVIEW_REQUIRED` and not written, exactly as a date conflict is.

   **The check belongs at import and nowhere else.** In public resolution a
   mismatch would deny a laboratory its instructions on the strength of an
   inference about an identifier segment. Handing over the wrong IFU and
   refusing to hand over the right one are both failures.
9. LOT uniqueness is scoped to the catalog number: `UNIQUE(catalog_number, lot_number)`.
   Whether Bioeksen LOT numbers are unique company-wide was **deliberately deferred
   on 2026-08-23** — it is a question for real import data, and the composite
   constraint is correct either way. Tightening to a global constraint later is
   additive and safe; discovering the assertion was false after imports have been
   rejected is not.

## Consequences

### Positive

- A format change is a change to one function and its tests.
- A silent wrong-date parse — which would resolve a LOT to the wrong IFU revision
  — is prevented by the conflict rule rather than detected after the fact.

### Negative / accepted costs

- The conflict rule means some imports need human intervention instead of
  completing unattended. That is the intended trade.
- The `2000 + YY` window breaks for dates outside 2000–2099. Accepted and
  documented; a LOT from 1999 is not a real case.

### Follow-up required

- If Bioeksen introduces a second LOT format, this becomes a strategy selected by
  an explicit format marker — never a chain of regex guesses.

## Alternatives considered

- **Prefer the parsed date on conflict.** Rejected: the parse is an inference and
  the supplied value may be authoritative.
- **Prefer the supplied date on conflict.** Rejected: the supplied value may be a
  spreadsheet error, which is the more common failure in practice.
- **Store only the parsed date and re-derive on demand.** Rejected: the parse
  result must be queryable, indexable and correctable independently of the
  identifier.
