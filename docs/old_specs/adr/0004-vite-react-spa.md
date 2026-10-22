# ADR-0004: Vite + React SPA, no SSR framework

- **Status:** Accepted
- **Date:** 2026-08-22
- **Proposed:** 2026-08-22 by Engineering
- **Accepted:** 2026-08-23 by the project technical lead

## Approval provenance

Vite + React SPA over an SSR framework was proposed by engineering and put to the project technical lead as an
explicit choice with alternatives. It was approved on 2026-08-23, which is what
moved this record from `Proposed` to `Accepted`.

Recorded because the ADR process only means anything if the status reflects a real
decision by someone with the standing to make it. A record that starts life as
`Accepted` because its author wrote it that way documents nothing.

## Context

The platform decisions fix "React + TypeScript" but not the application shell.
Surfaces are: a public e-IFU lookup form (behind a form, no SEO value — results
are per-LOT and must not be crawlable), the authenticated Academy learner
experience, and Training Studio, a backoffice.

## Decision

One Vite-built React SPA in TypeScript strict mode, served as static assets by
nginx, calling the Django API same-origin under `/api/v1/`.

## Consequences

### Positive

- No Node.js process in production. The deployment surface stays Django + nginx +
  PostgreSQL + Redis, which keeps the data-residency footprint small (ADR-0006).
- Same-origin serving is what makes session-cookie auth simple (ADR-0003).
- Fast builds and a straightforward test story with Vitest.

### Negative / accepted costs

- No server-side rendering. Initial load is a JS bundle; route-level code
  splitting is required, especially to keep Three.js out of the main chunk.
- Client-side routing needs an nginx fallback to `index.html`.

### Follow-up required

- Bundle budget enforced in CI once the first real screens exist.

## Alternatives considered

- **Next.js.** Rejected: SSR/SSG buys nothing here — no surface benefits from
  crawlability, and the e-IFU result page specifically must not be indexed. It
  would add a Node runtime to deploy, monitor and keep inside Türkiye.
- **Django templates for e-IFU, SPA for Academy.** Rejected: two frontend
  paradigms, two localization pipelines and two error-rendering paths for one
  product.
