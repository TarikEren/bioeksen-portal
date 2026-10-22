# ADR-0007: Retention of e-IFU personal access data

- **Status:** Accepted for implementation
- **Date:** 2026-08-22, retention period decided 2026-08-23
- **Business owner:** Bioeksen project ownership — decided the retention period
- **Legal owner:** Bioeksen legal function — owns lawfulness of collection and period
- **Technical owner:** Engineering
- **Formal legal review:** pending — see *Outstanding legal questions*

> This record was edited while `Proposed`, which the ADR process permits. Once a
> record is `Accepted`, changes come as a superseding ADR instead.

## Context

The e-IFU flow collects personal data — email, IP address, and optionally first
and last name — from **unauthenticated** users, as a condition of accessing a
regulatory document.

Earlier engineering documentation recorded the retention decision as
"indefinite until replaced by an approved policy". That was written as a settled
position, but it is not one engineering can settle.

KVKK Art. 4 requires personal data to be kept only for as long as necessary for
the purpose it was processed for, and Art. 7 requires erasure or anonymisation
once that purpose ends. Indefinite retention of identifiable data collected from
unauthenticated users is in tension with both. There is a countervailing
argument — traceability of who accessed which IFU revision may itself be a
regulatory obligation for a diagnostics manufacturer — but that argument covers
the *access event*, not necessarily the *identity of the accessor*, and it has
not been formally assessed.

This ADR records that the question is open. It is not a recommendation to change
current behaviour.

## Current position, stated in three parts

Conflating these is how a provisional operating state turns into a claimed
approval. They are recorded separately on purpose:

| | |
|---|---|
| **Interim technical behaviour** | No automatic deletion is implemented. |
| **Current operational retention** | Indefinite. This is the project's stated position and is unchanged. |
| **Final retention policy** | Pending Bioeksen legal approval. Not settled by this record. |

The project decided to retain indefinitely for now, and that decision stands and
is being implemented. What this ADR declines to assert is that indefinite
retention of identifiable personal data has been found **lawful** — engineering
has no standing to make that finding, and recording it as settled is how it stops
being reviewed.

## Decision

**Open.** No final retention period is approved.

Engineering proceeds under the following interim position, which is designed so
that any of the plausible legal outcomes is a configuration change rather than a
rewrite:

1. No automatic deletion is implemented. Current behaviour is unchanged.
2. The retention window is a configuration setting, not a constant in code.
3. Identifying columns (`email`, `first_name`, `last_name`, `ip_address`) are
   kept structurally separable from analytical columns, so that anonymisation
   can clear identifiers while preserving aggregate history.
4. A data-subject erasure/anonymisation operation exists and is itself audited.
   This is required under KVKK Art. 11 independently of the retention decision.
5. Analytics reads aggregates by default (`analytics.md`).

## Consequences

### Positive

- A bounded, defensible retention period replaces open-ended retention, which is
  a materially better KVKK posture.
- Analytics and traceability are unaffected: the access history stays complete,
  it simply stops naming people after five years.
- The period is a setting. If legal lands on three years or seven, that is a
  configuration change.
- What is decided and what is still open are visible separately, so the legal
  question does not quietly disappear now that a number exists.

### Negative / accepted costs

- Five years of identifiable retention still runs without a confirmed lawful
  basis. That exposure is smaller than indefinite retention, and it is recorded
  rather than assumed away.
- Anonymisation is irreversible by design. A record anonymised at five years
  cannot be re-identified if a later legal position turns out to require it — so
  a shortening of the period is safe to apply, but lengthening it only affects
  records not yet anonymised.
- Analytics that depend on distinguishing repeat visitors degrade past the
  five-year boundary. No current requirement does.

### Outstanding legal questions

- [ ] Lawful basis under KVKK for collecting email and IP from unauthenticated
      users in the e-IFU flow.
- [ ] Whether accessor **identity** is required for regulatory traceability, or
      whether the anonymised access event suffices. This is the question that
      determines whether five years is right, generous or short.
- [ ] Whether five years should align with the IVDR-style ten-year
      technical-documentation retention, given that the anonymised event is
      already kept indefinitely.
- [ ] Confirmation that anonymisation, rather than deletion, satisfies the
      obligation.
- [ ] Notice text and its versioning (`privacy-data-residency.md`).

**These do not block implementation.** They block the claim that the posture is
compliant, and they must be resolved before production release.

## Alternatives considered

- **Indefinite retention of identifiers.** The project's earlier position.
  Superseded by this decision: open-ended retention of identifiable data from
  unauthenticated users is the hardest posture to defend under KVKK Art. 4, and
  nothing required it.
- **Delete rows at five years.** Rejected: it destroys the traceability record
  and the analytics history along with the identifiers, forcing a choice between
  privacy and traceability that anonymisation avoids entirely.
- **Wait for legal before choosing any period.** Rejected: it leaves indefinite
  retention running as the de facto policy for the duration, which is the worse
  posture. A bounded period now, adjustable later, is strictly better.
