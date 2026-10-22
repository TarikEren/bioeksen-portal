# Review 3 — Stage B0: phase review in crisis mode

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| 3 | 2026-10-22 | The phase review of B0 (DEC-136, `crisis_mode.md` §4 step 5): the commits `a4c0d57..ee293cf` that no review had checked (the backend fixes of review 2, the demo, `2775b51`, `ee293cf`), and the review-2 findings they claim to fix. One `code-reviewer` agent; the main session checked the claims before it recorded them | `ee293cf` | Approve with follow-ups: no Critical or Major finding |

The log of every review, and the status of every finding: [README](README.md).

## Summary

Each fix that the commits claim is checked: R-015 (the rest), R-025 to R-044
and R-048 are fixed. For a test-only fix, the reviewer read the test and found
that it checks the rule; the integration, e2e and smoke tests were not run
(DEC-136). The demo meets DEC-135 and `sds-ci` › **The container image**,
except R-049. The 3-minute limit of FND-02.AC5 is not verified here (the
developer measured 99 s).

Checks at `ee293cf`: `pnpm run typecheck` and `pnpm run lint` pass; the unit
and component tiers give 299 passed and 4 failed (only FND-09.AC2), with no
unhandled error.

**Verdict: Approve with follow-ups.** No finding blocks B1 (`crisis_mode.md`
§4 step 6). The Minor findings are fixed later.

## Findings

Line numbers are as of `ee293cf`.

### R-049 — In the demo, a request with no credential gets 503 AUTH-5500 instead of 401 AUTH-4100

- **Status:** **Fixed (270a6e0)** — checked in review 4 · **Severity:** Minor · **Found:** review 3 (phase reviewer; confirmed)
- **Where:** `src/lib/auth/index.ts:110-113`, `authenticateOperator`, and its header at `:6-9`; the developer tests `src/lib/auth/auth.test.ts:158-167` and `src/app/api/demo.test.ts:81-96`.
- **Problem:** with `APP_ENV` `demo` and no `ENTRA_*` setting, a request with no `Authorization` header, a `Basic` header, `Bearer not-a-jwt` or an expired token gets 503 `AUTH-5500`. The `sds-auth` order gives `AUTH-4100`, `AUTH-4100`, `AUTH-4103` and `AUTH-4102` (steps 2 to 4 need no identity provider). FND-03.AC5 limits the 503 to a request with a bearer token (Q-13). Each anonymous call writes an `ERROR` record, not a `WARNING`.
- **Fix:** run steps 2 to 4 first; throw `AUTH-5500` when the provider is absent only at step 6. Correct the header and the two developer tests.

### R-050 — The fakes of @/lib/db and @/lib/cache in two route tests are not typed to the real modules

- **Status:** **Fixed (b415029)** — checked in review 4 · **Severity:** Minor · **Found:** review 3 (phase reviewer; confirmed)
- **Where:** `src/app/api/routes.test.ts:17-27`; `src/app/api/demo.test.ts:12-22`.
- **Problem:** the `vi.mock` factories are not checked against the modules; the fake `toDatabaseError` returns its input, while the real one returns an `AppError` (`sds-testing` › **Type safety**; same class as R-020).
- **Fix:** `vi.mock(import("@/lib/db"), …)` or `satisfies` the module type; the fake `toDatabaseError` returns an `AppError`.

### R-051 — Commit 2775b51 has the type fix, but it changes only a test

- **Status:** **Won't fix** (the history of the branch stays, as for R-045; the release note lists it as a test change) · **Severity:** Minor · **Found:** review 3 (phase reviewer; confirmed)
- **Where:** `2775b51`, whose only file is `src/app/api/routes.test.ts`.
- **Problem:** `sds-commit` › **Type**: `test` is the type of a correction of a test.
- **Fix:** none.

### R-052 — Production accepts the example identity key and pepper of .env.example

- **Status:** **Open** · **Severity:** Note · **Found:** review 3 (phase reviewer; confirmed from the code)
- **Where:** `.env.example` (32 zero bytes for `EIFU_IDENTITY_KEYS`, a `change-me-pepper-…` pepper); `src/lib/config/schema.ts:52-80`, `:219-233`.
- **Problem:** an operator who copies `.env.example` for production gets a ready app that encrypts identities (DEC-081) with a key that is public in the repository.
- **Fix:** in B4 (IFU-90), production refuses the example key and a `change-me` pepper with `CFG-5001`.

## Earlier findings

- **R-015:** fixed in `505705d`; the rest is checked in this review.
- **R-025 to R-044, R-048:** fixed; checked in this review. See the notes in [review 2](review_2.md).
