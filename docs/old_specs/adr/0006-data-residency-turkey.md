# ADR-0006: Production data resides in Türkiye

- **Status:** Accepted for implementation
- **Date:** 2026-08-22
- **Technical owner:** Engineering
- **Business owner:** Bioeksen legal function
- **Formal legal approval:** confirmed 2026-09-07 — see *Approval provenance*

## Approval provenance

Turkish data residency was stated as a project requirement.

**Confirmed on 2026-09-07** by Bioeksen project ownership, stated as following
from the legal and IVDR requirements: residency in Türkiye is correct and
sufficient, and no transfer abroad is planned.

What that does and does not settle, recorded separately because conflating them
is how a provisional state becomes a claimed approval:

| | |
|---|---|
| The requirement | Settled. Data resides in Türkiye. |
| Whether the posture satisfies KVKK | Asserted by project ownership as following from legal requirements. Engineering has not seen a written legal opinion and cannot certify one. |

If a provider, a backup target or a support arrangement later places data
outside Türkiye, KVKK Art. 9 transfer conditions apply and this record is
superseded rather than amended.

## Context

The platform stores personal data of individuals in Türkiye (e-IFU access
records, learner records) and controlled regulatory documents. KVKK Art. 9 makes
cross-border transfer a decision requiring a specific lawful basis, not a
deployment detail.

## Decision

All production data — database, object storage, cache, backups, logs — resides on
infrastructure physically hosted in Türkiye.

Every external dependency that would receive project or personal data is treated
as a residency decision requiring approval before adoption. This explicitly
includes analytics SDKs, error-tracking services, caching CDNs, email delivery
providers, and any AI/LLM API called with production data.

## Consequences

### Positive

- The compliance position is a property of the architecture, not of a policy
  document nobody reads at dependency-selection time.
- The self-contained stack (ADR-0001, ADR-0004) has few places where data could
  leak abroad by default.

### Negative / accepted costs

- Managed services common elsewhere are unavailable or need a Turkish region.
- Self-hosting more of the stack — object storage, mail, error tracking — costs
  operational effort.
- No global CDN for cached responses. Static asset CDNs are permitted only where
  they cache no personal data and no controlled document.

### Follow-up required

- Backup and restore targets must be verified as in-region, and restore must be
  tested (`security.md`).

## Alternatives considered

- **Cross-border transfer under a lawful basis.** Not rejected on principle, but
  out of scope: it requires legal work that has not been done, and the
  architecture should not depend on it.
