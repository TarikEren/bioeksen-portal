# e-IFU Domain

## Access flow

1. User enters Catalog Number, LOT Number, and email, and accepts the required
   legal/privacy acknowledgement (the consent text, ADR-0018).
   A six-digit code is sent to the address; the lookup proceeds only once it is
   entered (ADR-0018). The address on the access record is therefore one
   somebody proved, not one they typed — which is what a ten-year traceability
   record and an erasure request both depend on.
2. System resolves Catalog Number -> Product.
3. System resolves the supplied LOT **against already-imported LOT data**, scoped
   to that Catalog Number, and reads its `manufacturing_date`.
4. Check authorized explicit LOT override.
5. Otherwise resolve the Product-level IFU version whose effective period contains the manufacturing date.
6. Return all available language files for that resolved version.
7. Record access/analytics according to policy.

No registered account is required.

## The public endpoint never writes master data

`POST /api/v1/eifu/resolve/` is a **read** against master data. It must never
create or modify a `Product`, `CatalogNumber` or `Lot` row — not as a
convenience, not as a lazy import, not as an upsert on miss.

An unknown LOT returns `EIFU_LOT_NOT_FOUND`. A LOT that exists under a different
catalog number returns `EIFU_LOT_CATALOG_MISMATCH`. Neither creates anything.

Why this boundary is absolute:

- The endpoint is unauthenticated. Anything it can create, anyone can create.
  Auto-creating a `Lot` from user input would let a stranger write into the
  product master that a regulatory lookup depends on.
- The manufacturing date would then come from a parsed string typed by a member
  of the public, with no import provenance and no reviewer — and that date is
  precisely what selects the IFU revision.
- Import outcomes (`ALREADY_EXISTS`, `CONFLICT_REVIEW_REQUIRED`) exist so
  conflicting LOT data reaches a human. A silent create path bypasses all of it.

LOT master data enters the system through one door: authenticated CSV/XLSX import,
potentially daily, with a row-level report (`eifu-imports.md`).

The only rows the public flow writes are `EIFUAccessRecord` — its own access log,
including for failed lookups.

## Effective-period logic

If versions have effective dates V1, V2, V3, a LOT manufacturing date belongs to the latest published version effective on or before that date and before the next effective version.

Never implement e-IFU resolution as `latest revision` without date/applicability evaluation.

## Override

An authorized IFU Manager/Admin may bind a specific LOT to a different `PUBLISHED` or `SUPERSEDED` DocumentVersion of the same product (`state-machines.md`). Require reason and audit trail.

## Published file correction

An authorized user may replace an incorrectly uploaded file while keeping historical replacement trace. Do not silently delete the previous published file/object metadata.

## Withdrawal

Withdrawing a version leaves the period it covered uncovered. Whether the
previous revision reopens is an explicit choice by the person withdrawing, not
an inference: it is right when a revision was published in error and wrong when
its content was recalled. See `state-machines.md`.

## Roles

- IFU Manager: daily e-IFU operations.
- System/Platform Administrator: broad system capability subject to invariant/audit enforcement.

## Personal/access data

Record required access metadata such as email and IP under current policy. First/last name may later be enabled by policy. Marketing/update communications are not part of the e-IFU access flow.

Allowed transitions for `DocumentVersion`, file replacement and LOT override are tabulated in `state-machines.md`. Failure outcomes map to the `EIFU_*` codes in `error-codes.md`.

## The public address

The lookup is served at **`/eifu`**. `/` is the front door: two panels, one to
the lookup and one to the Academy sign-in.

Nothing is printed on packaging yet, which is the only reason this path could
move at all. **Once it is printed, it cannot change** — a URL on a box outlives
every deployment decision made after it, and a laboratory holding a five-year-old
kit has no other way in. Add a redirect before ever moving it again, and keep the
redirect forever.

The language toggle lives in this page's header. It is the one screen reached
without an account, it is bilingual by regulation, and until it had a toggle
whoever opened it got whatever their browser's language happened to be.
