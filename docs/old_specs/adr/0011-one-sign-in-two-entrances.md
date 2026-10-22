# ADR-0011: One sign-in, two entrances

- **Status:** Accepted
- **Date:** 2026-08-24
- **Proposed:** 2026-08-24 by Engineering
- **Accepted:** 2026-08-24 by the project technical lead
- **Technical owner:** Engineering

## Context

The portal has two audiences that look different enough to suggest two front
doors: learners taking Academy courses, and staff operating the backoffice —
uploading IFUs, publishing revisions, correcting files, running imports.

The question was whether the backoffice should have its own sign-in.

## Decision

**One authentication mechanism, one credential, one session.** A single
`POST /api/v1/auth/login/`, as ADR-0003 describes.

**Two entrances after it.** Where a person lands, and what the interface
offers, is decided by the permissions they hold — not by which URL they signed
in through. Someone holding backoffice permissions is offered the backoffice;
everyone is offered Academy; someone with both sees both and can move between
them.

## Consequences

### Positive

- It preserves the invariant the domain model is built on: one `User`
  identity, roles that compose. `organization-model.md` names the case
  explicitly — a Bioeksen employee who is both a Learner and a Content Author.
  Two sign-ins would give that person two doors to one account.
- One authentication path means one place where lockout, rate limiting, session
  handling and the credential-disclosure rules live. Two would mean two, and
  the second would drift.
- The permission system already decides what someone may do. Deciding it again
  at the door would put the same authority in two places.
- MFA for staff, when it comes, is a policy on roles within this one flow
  rather than a second login — which is what `authentication-authorization.md`
  meant by allowing MFA "without reworking identity fundamentals".

### Negative / accepted costs

- The public sign-in form is reachable by anyone, including staff accounts. The
  mitigation is the one that actually works: lockout, rate limiting, and
  identical responses for a wrong password and an unknown address.
- Routing after sign-in depends on permissions being loaded, so the interface
  has a brief resolving state that a fixed per-audience login would not.

### Follow-up available, not required

Restricting the backoffice **area** at the network layer — VPN or an IP
allow-list — remains open and does not conflict with this decision. It
restricts a surface rather than splitting authentication, which is the
distinction this ADR turns on.

## Alternatives considered

- **A separate backoffice login endpoint.** Rejected: identical mechanism,
  identical credential, no security gained. What it adds is a second code path
  for authentication bugs to live in.
- **A separate backoffice user model.** Rejected outright — `domain-model.md`
  forbids parallel user tables, and the compose-roles case is a requirement.
- **One login, one destination for everyone.** Rejected: a learner has no
  reason to see the backoffice, and an IFU manager should not have to navigate
  out of a course catalogue to do their job.
