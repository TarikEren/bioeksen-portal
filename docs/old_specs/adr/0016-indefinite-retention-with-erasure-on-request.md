# ADR-0016: Indefinite retention of e-IFU access identifiers, with erasure on request

- **Status:** Accepted for implementation — legal review pending

  The same status ADR-0005, 0006, 0007 and 0008 carry, and for the same reason:
  the decision is made and is being built, and what remains outstanding is a
  sign-off from a function outside engineering. It is not `Proposed`, because
  nothing about it is awaiting an engineering decision.
- **Date:** 2026-09-06
- **Supersedes:** ADR-0007's five-year period. ADR-0007's open legal questions
  are **not** closed by this record and are carried forward unchanged.
- **Business owner:** Bioeksen project ownership — decided the position
- **Legal owner:** Bioeksen legal function — owns lawfulness of collection and period
- **Technical owner:** Engineering
- **Formal legal review:** pending — see *Outstanding legal questions*

## Context

ADR-0007 could not be read as a single position. Its *Current position* table
and *Decision* items 1–2 say:

> No automatic deletion is implemented. Current operational retention:
> **Indefinite**.

Its *Consequences* and *Alternatives considered* say the opposite:

> A bounded, defensible retention period replaces open-ended retention. […] it
> simply stops naming people after five years. […] **Indefinite retention of
> identifiers** — the project's earlier position. **Superseded by this
> decision.**

The record notes that it was edited while `Proposed`, which the process permits.
The two halves are the two sides of that edit, and the edit was not finished.

`docs/adr/README.md` is explicit that an accepted ADR is superseded rather than
corrected, so this record exists instead of a fix to that one.

Meanwhile, engineering built the retention job to the *five-year* reading,
because `CLAUDE.md`, `.env.example`, `privacy-data-residency.md` and the schema
comments all said five years. That made four documents agree with each other and
with the code, and disagree with half of the ADR that governs them.

## Decision

**Identifiers are retained indefinitely. Erasure happens on request.**

Decided by project ownership on 2026-09-06.

1. `EIFU_ACCESS_RECORD_RETENTION_DAYS` defaults to **0**, which disables the
   scheduled anonymisation pass. Indefinite retention is now the configured
   behaviour and not merely the absence of a job.
2. The setting remains the period and remains configuration, not a constant. A
   later legal answer of three years, five or seven is a value change and
   nothing else — the pass, its batching, its `anonymised_at` stamp and its
   audit event are built, tested and dormant.
3. Erasure on request is the operative mechanism:
   `POST /api/v1/privacy/erasure`, behind `platform.system.administer`,
   audited, matching on the address as stored. It clears the identifying
   columns and stamps `anonymised_at`.
4. **Anonymise, never delete the row.** Unchanged from ADR-0007 and not
   reopened: deleting whole records would destroy the traceability history and
   the analytics with it.
5. There is no self-service erasure path. The e-IFU flow is unauthenticated, so
   anyone could claim any address; a request is verified out of band by an
   administrator, who records how in the `reason` field.

## Consequences

### Positive

- One position, in one place, matching the code. The contradiction that made
  four documents disagree with the governing ADR is gone.
- Erasure is now a *capability that exists and is tested*, rather than a period
  that would have arrived in five years' time. Under KVKK Art. 11 a data
  subject can ask today, and today the answer is an endpoint.
- Traceability of who accessed which IFU revision is complete and stays
  complete. If the regulatory argument in ADR-0007 — that accessor identity may
  itself be a traceability obligation for a diagnostics manufacturer — is
  upheld, this posture already satisfies it.

### Negative / accepted costs

- **This is the posture ADR-0007 called the hardest to defend.** Its own words:
  open-ended retention of identifiable data collected from unauthenticated
  users is in tension with KVKK Art. 4 (kept only as long as necessary) and
  Art. 7 (erasure or anonymisation once the purpose ends). Choosing it is a
  decision the business owner is entitled to make and the legal owner has not
  yet reviewed. It is recorded here rather than assumed away.
- Erasure on request only reaches people who ask. Art. 7's obligation is not
  conditional on a request, so if legal finds that a period is required, the
  exposure is every record not yet asked about.
- The anonymisation pass is dormant code. Dormant code rots, so it keeps its
  tests and they run on every build.

### Outstanding legal questions

Carried forward from ADR-0007 unchanged, and one added:

- [ ] Lawful basis under KVKK for collecting email and IP from unauthenticated
      users in the e-IFU flow.
- [ ] Whether accessor **identity** is required for regulatory traceability, or
      whether the anonymised access event suffices.
- [ ] Confirmation that anonymisation, rather than deletion, satisfies the
      obligation.
- [ ] Notice text and its versioning (`privacy-data-residency.md`).
- [ ] **New.** Whether erasure on request satisfies Art. 7 without a defined
      retention period, or whether a period is required regardless of whether
      anybody asks.

**These do not block implementation.** They block the claim that the posture is
compliant, and they must be resolved before production release.

## Alternatives considered

- **Keep five years.** What the code did until this record. Rejected by project
  ownership: the access history is a traceability record and pruning the
  identity from it after an arbitrary period was not wanted.
- **Finish ADR-0007's edit in place.** Rejected on process grounds — an accepted
  ADR is superseded, never edited — and on substance: the contradiction is
  itself worth a record, because it is how a provisional position spent two
  weeks looking settled in four documents.
- **Delete rows on request rather than anonymising.** Rejected for the reason
  ADR-0007 gives: it destroys the traceability record and the analytics along
  with the identifiers, forcing a choice between privacy and traceability that
  anonymisation avoids.
