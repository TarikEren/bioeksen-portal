# Testing Strategy

Prioritize invariant and risk coverage over percentage targets. A suite that
covers every line and none of the invariants passes while the product returns
the wrong regulatory document.

## The suite

Vitest, both packages — one runner across the repository, for the same
estate-consistency reason that moved the backend to TypeScript (ADR-0015).
The backend transforms with SWC rather than esbuild, because NestJS resolves
dependencies from decorator metadata that esbuild does not emit.

**Vitest does not type-check.** `make verify` runs `tsc --noEmit` separately,
and it has caught things a green suite did not.

### Real PostgreSQL, never a substitute

The guarantees this system leans on — an exclusion constraint, partial unique
indexes, check constraints, append-only triggers — exist only in the database.
A suite on an in-memory substitute passes while every one of them is absent.

Consequences, all enforced in `backend/test/global-setup.ts`:

- **A separate database from development**, or the first `make test-backend`
  after somebody seeds data destroys it and they find out later.
- **A separate database per run**, named with the process id and dropped on
  teardown. Every run opens by dropping its database `WITH (FORCE)`, which
  terminates whatever is connected; one shared name means a second `vitest`
  pulls the first one's database out from under it. An editor watching and a
  terminal running is enough to produce that. `KEEP_TEST_DATABASE=1` keeps the
  database, for when the reason a test failed is in the rows.
- **Dropped and recreated every run**, so the suite never runs against whatever
  shape previous runs left behind.

### An end-to-end spec listens once

`await app.listen(0)` in `beforeAll`, never `app.init()`.

Supertest starts the server itself for a request that arrives at one which is
not listening, and closes it again afterwards — so a file's requests are spread
across a succession of short-lived servers on ephemeral ports, and between the
close and the next request that port belongs to nobody. Anything else on the
machine can take it. This suite has answered a sign-in with Express's own 404
page and, once, with an unrelated API's authentication error: the request had
reached a stranger.

### An assertion says which failure it is

`expect(response.status).toBe(200)` reports "expected 401 to be 200", which
says a sign-in failed and not which of the several reasons it can fail for.
Where a response can fail in more than one way, pass the body — and the text —
as the assertion message.

## Critical e-IFU scenarios

`eifu-resolution-specification.md` is normative and carries 21 acceptance
vectors with exact inputs and expected outcomes. Build against those rather
than against this list, which is the summary:

- valid CAT + valid LOT -> correct Product and IFU version
- example LOT `B2603091224GHPVV` -> manufacturing date `2026-03-09`
- malformed/impossible encoded date -> rejected/flagged
- old LOT -> historical superseded IFU
- latest IFU must not be returned when date says otherwise
- specific LOT override -> override version and audit event
- draft/non-published IFU -> never returned publicly
- all available language files -> returned for resolved version
- duplicate LOT exact -> skipped/warned
- duplicate LOT conflict -> manual review required
- published IFU replacement -> prior file history retained

## Critical Academy scenarios

- unauthenticated Academy access -> rejected
- author cannot approve own CourseVersion
- approved does not automatically mean published
- publishing new version -> previous version superseded
- completion/certificate retains original CourseVersion
- assignment may target user or organization
- required assignment may have no due date
- version policy applies correctly
- failed assessment remediation rules enforced
- revoked certificate remains verifiable as revoked

### What an assessment test is actually for

An attempt is the evidence behind a certificate, so the assertions worth
writing are about a result being trustworthy rather than being correct:

- the score is computed on the server and a client's claimed result is ignored
- `correct_answer` does not travel with the questions, at any layer
- a submitted attempt cannot be edited afterwards
- an attempt held open does not get around an attempt limit

The last two are enforced by the database as well as the service, and the
tests assert them from outside the service for that reason.

## Authorization

Test positive and negative object-level permission cases, especially
organization-scoped views and Distributor/Customer relationships.

Every permission code in `permission-matrix.md` wants a positive and a negative
test. **No governance check enforces this** — `scripts/` cannot tell a real
test from a token one — so it holds only as far as review does.

## State transitions

Every transition in `state-machines.md` requires a test for the allowed path
and a test proving a forbidden transition is rejected with the documented error
code.

Where the database also enforces the rule, assert it against the database:
remove the service check and the test should still fail. That is the difference
between testing a guard and testing the invariant the guard describes.

## Frontend

Test critical authoring and learner flows, localization, error states, and
configuration rendering.

Match user-visible labels as **exact strings**, not `/…/i` regexes. Turkish `İ`
does not case-fold to ASCII `i` — `'İ'.toLowerCase()` is `i` plus a combining
dot — so a case-insensitive regex silently fails to match a large part of this
interface, and reads as the element being absent.

## Accessibility

`vitest-axe` runs against the application shell in `App.test.tsx` and its
violations fail the suite. `color-contrast` is disabled there because jsdom
does not compute colour; contrast is held by the tokens and the contrast
contract in `design-system.md` instead.

axe catches roughly a third of real issues. Passing it is a floor, not a
result — see `accessibility.md`.
