# Architecture

## Decision

Bioeksen Portal is a modular monolith deployed as one logical application suite with a TypeScript/NestJS backend and React frontend in a monorepo (ADR-0015).

## Rationale

The e-IFU, Product, Organization, Academy, Audit, and Certification domains share transactional data and governance rules. Premature service separation would add distributed authorization, API versioning, retries, observability, deployment, and consistency complexity without current business value.

## Backend domain boundaries

Prefer explicit domain modules such as:

- accounts
- organizations
- products
- catalogs
- lots
- documents
- eifu
- training
- assessments
- certificates
- notifications
- analytics
- audit

Do not use `core`, `common`, `helpers`, or `utils` as unowned dumping grounds.

## Dependency rule

Cross-domain behavior must be intentional. Prefer explicit application/service interfaces over scattered ORM access that creates hidden coupling.

Do not duplicate canonical domain entities simply to avoid a dependency.

## Frontend boundaries

Prefer feature-oriented boundaries:

- auth
- eifu
- academy
- products
- organizations
- training-studio
- certificates
- analytics
- administration

Separate API clients, domain types, UI components, and simulation/rendering engines.

## Future service extraction

Only consider extraction when there is evidence for independent scaling, isolation, deployment cadence, compliance boundary, or operational ownership. Record the decision before implementation.

Each backend domain listed above has a corresponding reference file. `notifications` -> `notifications.md`, `analytics` -> `analytics.md`, `audit` -> `audit-traceability.md`, `documents`/`eifu` -> `eifu-domain.md`, `training`/`assessments`/`certificates` -> `academy-domain.md`.
