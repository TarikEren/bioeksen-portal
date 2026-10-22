# ADR-0001: Modular monolith over microservices

- **Status:** Accepted
- **Date:** 2026-08-22
- **Deciders:** Engineering

## Context

Bioeksen Portal spans e-IFU, Product master, Organizations, Academy, Certification
and Audit. These domains share transactional data and governance rules: publishing
a course version writes audit, supersedes a previous version and may expire
certificates, all of which must succeed or fail together.

## Decision

The backend is a modular monolith: one Django project, explicit per-domain apps,
one PostgreSQL database, one deployment unit.

Domain boundaries are enforced by discipline — explicit service interfaces
between apps — not by network boundaries.

## Consequences

### Positive

- Multi-domain invariants are enforced by `transaction.atomic()` and database
  constraints rather than by distributed sagas.
- No distributed authorization, retry, tracing or API-versioning overhead at a
  team size that does not need it.
- Referential integrity across domains is available and used.

### Negative / accepted costs

- Domain isolation depends on review discipline. Nothing physically prevents an
  import across a boundary.
- The whole application scales as one unit.

### Follow-up required

- Service extraction requires evidence of independent scaling, isolation,
  deployment cadence, compliance boundary or operational ownership — recorded in
  a new ADR **before** implementation.

## Alternatives considered

- **Microservices from the start.** Rejected: it would impose distributed
  consistency costs on invariants that are inherently transactional, with no
  current scaling or organizational driver.
- **Separate e-IFU and Academy applications.** Rejected: both depend on the same
  canonical `Product` identity. Splitting them would force duplicating product
  identity, which is the one thing the domain model explicitly forbids.
