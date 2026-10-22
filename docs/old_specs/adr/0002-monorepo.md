# ADR-0002: Monorepo

- **Status:** Accepted
- **Date:** 2026-08-22
- **Deciders:** Engineering

## Context

Backend and frontend share an API contract, an error-code registry, a permission
registry and a localization key space. All four drift silently when they live in
separate repositories on separate release cadences.

## Decision

One repository holds `backend/`, `frontend/`, `infra/`, `docs/` and `scripts/`.
One CI pipeline runs the whole verification gate.

## Consequences

### Positive

- A change to an error code, a permission or a state transition lands together
  with its frontend consumer and its documentation, in one reviewable diff.
- `git-workflow.md` can require documentation updates in the same PR, and CI can
  enforce it.
- One version of truth for tooling and governance scripts.

### Negative / accepted costs

- CI runs both suites on every change unless path filtering is added.
- Repository history mixes backend and frontend commits.

## Alternatives considered

- **Polyrepo with a shared contract package.** Rejected: it adds a publish/consume
  cycle between every contract change and its use, which is exactly the latency
  that lets contracts drift.
