# ADR-0003: Django session cookies for Academy authentication

- **Status:** Accepted
- **Date:** 2026-08-22
- **Proposed:** 2026-08-22 by Engineering
- **Accepted:** 2026-08-23 by the project technical lead

## Approval provenance

Session cookies over JWT was proposed by engineering and put to the project technical lead as an
explicit choice with alternatives. It was approved on 2026-08-23, which is what
moved this record from `Proposed` to `Accepted`.

Recorded because the ADR process only means anything if the status reflects a real
decision by someone with the standing to make it. A record that starts life as
`Accepted` because its author wrote it that way documents nothing.

## Context

`authentication-authorization.md` fixes email + password as the initial Academy
credential but left the transport mechanism unspecified, so every implementation
session would have chosen arbitrarily.

Constraints: accounts are administrator-created, there is no public
self-registration, there is no mobile or third-party client in scope, MFA must be
addable later, and the frontend is a first-party SPA served from the same origin
as the API behind nginx (ADR-0004).

## Decision

Authentication uses Django's session framework with cookie-based sessions and
CSRF protection.

- `Secure`, `HttpOnly`, `SameSite=Lax` session cookie.
- CSRF token required on every unsafe method; failures return `CSRF_FAILED`.
- Frontend and API are served same-origin. CORS credentials are not enabled.
- Session invalidation on password change and on administrative deactivation.
- Brute-force protection with account lockout (`AUTH_ACCOUNT_LOCKED`).

The e-IFU flow remains unauthenticated and stateless; it is unaffected.

## Consequences

### Positive

- The session cookie is `HttpOnly`: an XSS bug cannot read the credential, which
  a `localStorage`-held JWT cannot claim.
- Revocation is immediate — deleting the session ends access. No refresh-token
  blacklist, no token-rotation machinery.
- Django-native. MFA and email verification slot into the existing auth backend
  without touching identity fundamentals.

### Negative / accepted costs

- Session state in the backing store; sessions are stored in Redis rather than
  the database to keep them out of the transactional path.
- A future non-browser client would need a separate token mechanism. Accepted:
  none is in scope.
- CSRF handling is an explicit frontend concern.

## Alternatives considered

- **JWT (SimpleJWT).** Rejected: statelessness is not a requirement here, and its
  cost — token storage exposed to XSS, revocation complexity, refresh rotation —
  is real. Revocation matters in a platform where an administrator deactivating a
  distributor's account must take effect immediately.
- **DRF `TokenAuthentication`.** Rejected: non-expiring, non-rotatable single
  tokens are not appropriate for a platform under audit obligations.
