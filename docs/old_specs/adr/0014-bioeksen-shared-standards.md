# ADR-0014: BioEksen shared standards, and where this app keeps its own error codes

- **Status:** Accepted
- **Date:** 2026-09-04
- **Technical owner:** Engineering
- **Business owner:** None. This is an engineering estate standard.
- **Deciders:** Doğukan Ugün. The `bioeksen-sds` standards themselves are owned
  by BioEksen Ar-Ge Teknolojileri A.Ş. and were not written here; the deviation
  in *Decision* §3 has **not** been reviewed by that owner — see *Follow-up*.
- **Supersedes / Superseded by:** none

## Context

`bioeksen-sds@bioeksen-skills` is enabled for this repository. It publishes four
cross-service standards: API design, authentication, logging and commits. They
are conventions for the whole BioEksen estate, not for this app, and their value
is precisely that every app obeys them identically.

Three of the four land on ground this project had left thin or empty:

- **Standard endpoints.** `sds-api-design` requires `GET /api/health/live`,
  `/api/health/ready`, `/api/health` and `GET /api/admin/logs` on every app,
  with fixed paths and schemas. This app exposes **none** of them.
- **Log records.** `logging-observability.md` is seven lines of guidance
  ("use structured technical logs"). `sds-logging` supplies a normative
  six-field record with a logfmt tail and per-request correlation.
- **Commits.** This project already writes Conventional Commits.
  `sds-commit` adds a mandatory `Change-Id:` trailer tying each commit to its
  release-note entry.

The fourth, `sds-auth`, draws its own boundary and stays outside our way:

> There is no third kind. An endpoint that seems to need one is either
> misdesigned or is an end-user endpoint belonging to a specific app's own
> domain, **which this skill does not cover.**

So Academy's learner and backoffice endpoints keep session cookies and CSRF
(ADR-0003). `sds-auth` governs only the two new estate-facing endpoints, which
take an Operator bearer token.

### The one place the standards collide

`sds-logging/references/code-prefixes.md` is a **closed** list of 38 error codes
— `AUTH-4100`, `PERM-4150`, `VAL-4001`, `SYS-5000` — and states:

> `code-prefixes.md` is the single registry for the whole estate. Apps do not
> keep their own; a code that exists in one repository and nowhere else cannot
> be filtered, alerted on, or looked up.

`docs/engineering/error-codes.md` is this app's registry: roughly sixty domain
codes such as `COURSE_AUTHOR_CANNOT_APPROVE`, `EIFU_LOT_DATE_CONFLICT` and
`COURSE_VERSION_NOT_DISCARDABLE`. Both documents forbid inventing a code. They
forbid it about different lists.

The closed list cannot express any of ours, and it is not meant to: it is built
for machine callers and operators, where "not permitted" is the whole answer.
Ours are read by a person deciding what to do next. Collapsing them to
`PERM-4150` would give every Academy refusal the same Turkish sentence — *"Bu
işlem için yetkiniz bulunmuyor"* — and a learner could no longer tell "you may
not approve your own version" from "your grace period ended". It would also
break the frontend contract that maps `code` to a translation key, and the
`design-system.md` rule that every error carries its registered code.

## Decision

We adopt `bioeksen-sds` in full, with one scoped deviation.

**1. The envelope is SDS's.** Every error response carries `status`, `code`,
`message` and `details`, where `details` is `null` unless the failure is a
validation error, in which case it is an array of `{field, issue}`. Retry
timing moves from `details` to the `Retry-After` header, which is where HTTP
already puts it.

**2. Estate-facing endpoints use SDS codes verbatim.** `GET /api/health`,
`GET /api/admin/logs` and any future service-to-service surface take their
`code` from `code-prefixes.md`, unmodified, chosen by SDS's selection
procedure.

**3. End-user endpoints keep this app's domain codes in `code`, and carry an
SDS code in the log record.** Every `DomainError` declares both. The browser
receives `COURSE_AUTHOR_CANNOT_APPROVE`; the log record for the same failure
carries `PERM-4150`, with the domain code in its logfmt tail as
`domain_code=...`.

This is the deviation. It is a deviation from the letter of the single-registry
rule and not from its reason: SDS wants a code an operator can filter the
aggregator by, and after this change every failure has one. The `code` a
browser receives is a different contract, with a different consumer, in a
language the aggregator never sees. `sds-auth` already draws exactly this
boundary around end-user endpoints; we extend it one document to the left.

**4. Log records follow `log-record.md`.** Six fields, prose fixed by the SDS
code, everything variable in a logfmt tail, `request=<id>` on every record
emitted while handling one request.

**5. Commits follow `sds-commit`,** including the `Change-Id:` trailer.
`git-workflow.md`'s existing prohibition on AI attribution lines stands
unchanged and takes precedence over any tooling default that adds one.

## Consequences

### Positive

- The gap that mattered most closes: this app had no health, readiness or
  liveness endpoint at all, so nothing could tell whether it was serving.
- An operator can take a code off a user's screenshot, look it up in
  `error-codes.md`, and find the aggregator records by the SDS code it maps to.
- The frontend localization contract, `error-codes.md` and 427 passing tests
  survive untouched in their essentials.
- `logging-observability.md` stops being advice and becomes a contract.

### Negative / accepted costs

- **Two codes per failure, which can drift.** A domain code whose SDS mapping
  is wrong is invisible in review. `scripts/` gains a check that every code in
  `error-codes.md` declares an SDS code and that the code exists in SDS's list.
- We are knowingly outside the letter of a standard we do not own. Recorded
  here rather than left for someone to discover.
- The envelope change is breaking for any client reading `details` as an
  object. Only our own frontend does, and it changes in the same commit.
- A second authentication mechanism (Operator bearer tokens) now exists
  alongside session cookies, on two endpoints. Two mechanisms is the cost of
  being both an app with users and a service in an estate.

### Follow-up required

- **Propose `EIFU-` and `ACAD-` prefixes upstream** to BioEksen Ar-Ge, in
  `bioeksen-ai-skills`. That is the honest long-term resolution: one registry,
  specificity kept. It needs three coordinated changes there
  (`code-prefixes.md`, the `ErrorCode` enum in `openapi.yaml`, and the
  selection procedure) and the owning team's agreement. Until then, §3 stands.
- **The log aggregator host is not known to this project.** `sds-logging`
  requires apps to emit there and nowhere else. Until Bioeksen supplies the
  host, records are written to stdout in the aggregator's own record format,
  so the transport is the only thing left to add. Registered in
  `deferred-work.md`.
- The `bioeksen-sds` plugin is enabled in user settings but its cache holds
  only `plugin.json`; the skills are not installed and do not load. Reinstall
  the plugin, or the standards are followed from memory rather than from the
  source.

## Alternatives considered

**Replace the domain registry with SDS codes entirely.** One registry, no
deviation. Rejected: the specific reason would have to move into `details`,
making `details` the real contract and `code` nearly useless — the opposite of
what both documents exist for. It would also rewrite the frontend error
contract, both locale files, and every test asserting a code, to end up
communicating less.

**Extend SDS with Bioeksen domain prefixes first, build after.** The right
end state, and it is the follow-up above. Rejected as the *immediate* step
because it blocks all Academy work on another team's review of a document we
do not own, for a change we can make correctly and reversibly here in the
meantime.

**Ignore SDS for this app.** Rejected without much thought: the app has no
health endpoint, no log record contract and no readiness probe. The standards
are not overhead here, they are the missing half.
