# ADR-0015: The backend is TypeScript on NestJS, rebuilt rather than ported

- **Status:** Accepted
- **Date:** 2026-09-04
- **Technical owner:** Engineering
- **Business owner:** None. This serves an engineering estate concern.
- **Deciders:** Doğukan Ugün.
- **Supersedes / Superseded by:** none. See *Relationship to earlier ADRs*.

## Context

The backend was built in Django 5.2 + DRF: fourteen domain modules, 6,778 lines
of source, 4,020 lines of tests, 66 migrations, 29 database constraints. It
works. `make verify` is green.

Three facts made the language a live question anyway.

**BioEksen's other products are TypeScript.** A house that reads one language
reviews faster, staffs more easily, and moves people between products without a
month of ramp-up. Django here is the outlier, not the norm.

**The shared standards already anticipate more than one language.**
`sds-logging` closes with:

> Library choice, logger configuration, error class hierarchies and framework
> middleware are language-specific and are not defined here. […] Split this
> section into `sds-<language>` skills once a second language is in use; the
> contract above stays here.

The estate contract is the record shape and the code list, neither of which
cares what emits them. A TypeScript app satisfies `bioeksen-sds` exactly as
well as a Python one — and if the rest of the estate is TypeScript, better,
because there will be an `sds-typescript` binding to share.

**The system has never been used.** No production deployment, no users, no
data. Every month from here makes this decision more expensive; today it costs
a rewrite of code that has never served a request.

## Decision

The backend is **TypeScript on NestJS, with Prisma over PostgreSQL.** The
frontend stays React + Vite, unchanged. The screen designs stay as drawn.

It is a **rebuild, not a port.** The Python is deleted rather than mechanically
translated, because a translated codebase carries the idioms of the language it
came from and is then neither.

**One artefact survives, deliberately:**
`docs/engineering/eifu-resolution-specification.md`. e-IFU resolution is the
regulated part of this product — a plausible-looking implementation hands a
laboratory the wrong instructions — and it was the one behaviour whose
correctness lived in code and tests rather than in prose. It has been extracted
into a behavioural specification with the exact constants, the exact constraint
DDL, the exact algorithm ordering, and 21 acceptance vectors. That document is
now normative, and the new implementation is checked against it rather than
against the code it replaces.

`backend/apps/lots/tests/lot_number_vectors.json` also survives unchanged. It
is data, not Python, and it is already shared between two consumers precisely so
they cannot drift.

### Framework and ORM

**NestJS** because ADR-0001's modular monolith stands: NestJS modules map onto
the fourteen domain modules one-to-one, and its dependency injection suits a
codebase where every state transition is a service function and nothing sets a
status field directly.

**Prisma** for the ORM, chosen with its cost understood and accepted.

## Consequences

### Positive

- One language across the estate. One review culture, one toolchain, one set of
  idioms; a developer moves between products without changing register.
- The frontend and backend share types, validation schemas, and the locale
  files that were previously duplicated across a Python/TypeScript boundary.
- `sds-logging`'s language binding can be shared with the other products
  instead of written twice.
- e-IFU resolution comes out of this better specified than it went in. The
  extraction surfaced two behaviours that were artefacts of statement order
  rather than decisions — both are recorded as open questions in the
  specification rather than being silently carried across.

### Negative / accepted costs

- **All 29 database constraints move out of the schema and into hand-written
  SQL migrations.** Prisma's schema language cannot express a `CHECK`, a
  partial unique index with a `WHERE`, or an `EXCLUDE USING gist`. This is not
  a detail: those constraints are where this system's safety actually lives —
  `applicability_no_overlap_per_product` is what makes ambiguous e-IFU
  resolution unreachable, and `courseversion_author_cannot_approve` is what
  binds separation of duties for every role including Platform Administrator.
  Under Prisma they are invisible to the schema and to `prisma migrate diff`,
  so:
  - each one lives in a migration whose only job is that constraint;
  - `prisma db push` is **never** used, on any environment;
  - a governance check asserts every named constraint is present in the live
    database, so a lost constraint fails the build rather than being discovered
    by a wrong document reaching a laboratory.
- 6,778 lines of working, tested code are discarded. The e-IFU part of it is
  regulated, which is why the specification exists; the rest is ordinary CRUD
  and lifecycle code whose rules are already written down in
  `docs/engineering/`.
- The 4,020-line test suite is not carried over. The invariants it encoded are
  documented in `state-machines.md`, `permission-matrix.md` and the e-IFU
  specification; the new suite is written from those. This is the largest risk
  in the decision and it is taken knowingly: nothing is in production, so a
  behavioural regression costs rework rather than a wrong document in a lab.
- Django's batteries have to be replaced individually: `django-axes` (lockout),
  `django-storages` (S3/MinIO), Celery (background work), the admin, the
  migration autogenerator, and the permission plumbing.

### Follow-up required

- Rewrite `backend-django.md`, `tech-stack-versions.md`,
  `database-migrations.md`, `testing.md`, `local-development.md`,
  `repository-structure.md`, `dependencies.md` and `coding-standards.md`.
  Until they are rewritten they describe a backend that does not exist —
  each gains a header saying so on the day Django is removed.
- `Makefile`, `start.sh`, `infra/docker/` and the `scripts/` governance checks
  all reach into the Python backend and need rebuilding.
- The `bioeksen-sds` plugin is enabled but its cache holds only `plugin.json`,
  so the skills do not load (ADR-0014). Reinstalling it matters more now, since
  an `sds-typescript` binding is the natural next thing to want.

## Relationship to earlier ADRs

| ADR | Effect |
|---|---|
| 0001 Modular monolith | **Stands.** A NestJS module boundary is the new expression of it. |
| 0002 Monorepo | Stands. |
| 0003 Session cookies for Academy auth | **The decision stands** — cookies over bearer tokens for end users, for the reasons given there. Only its Django-specific implementation is obsolete. |
| 0004 Vite + React SPA | Stands, untouched. |
| 0005 Product-level applicability | Stands. Restated in the e-IFU specification. |
| 0007 Access-record retention | Stands. `EIFU_ACCESS_RECORD_RETENTION_DAYS` remains a setting, never a constant. |
| 0008 LOT date parsing | Stands. Its vector file crosses unchanged. |
| 0009 Localized content as per-locale JSONB | Stands. The check constraints enforcing locale completeness become hand-written SQL, per the cost above. |
| 0010 Design tokens from the brand | Stands. Frontend only; untouched. |
| 0012, 0013 Product identity, kit code | Stand. |
| 0014 BioEksen shared standards | Stands and gets easier: the envelope, the log record and the standard endpoints are built into the new backend from the first commit rather than retrofitted. |

## Alternatives considered

**Keep Django.** The code exists, is tested, and works. Rejected because the
reason for changing is not technical merit — Django is a good fit for this
domain — but estate consistency, and that reason does not go away with time. It
only gets more expensive to act on.

**Port the test suite first, then make it pass** (the sequencing this ADR's
author recommended). It would have made "the behaviour did not change" provable
rather than asserted. Rejected on the grounds that the system has never run for
a user, so there is no behaviour in the field to preserve — and a
mechanically translated suite would encode Django's fixture and ORM idioms
into a codebase trying to leave them. The e-IFU specification carries the part
of that guarantee that actually mattered.

**Strangler: run TypeScript alongside Django and move endpoints one at a time.**
The standard answer for a system with users. Rejected because this one has
none, and the cost — two runtimes, two dependency trees, and a router in front
of them for the whole transition — buys a safety property that is not needed
here.

**Drizzle instead of Prisma.** Drizzle expresses `CHECK` constraints and
conditional partial unique indexes in the schema itself, which would have kept
27 of the 29 constraints declarative and visible next to the columns they
guard. Rejected in favour of Prisma's maturity, tooling and much wider
familiarity — the same estate-consistency argument that motivates this ADR at
all. The cost is written down above, and the governance check that every named
constraint exists in the live database is what pays for it.
