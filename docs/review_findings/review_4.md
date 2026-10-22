# Review 4 — Stage B1: phase review in crisis mode

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| 4 | 2026-10-22 | The phase review of B1 (DEC-136, `crisis_mode.md` §4 step 5): the commits `f903986..b415029` (the contract, the mock skeleton, the frontend, the backend), and R-049 and R-050 that they claim to fix. One `code-reviewer` agent; the main session checked the claims before it recorded them. R-061 to R-063 come from the walk of the exit flow on the demo (§5) | `b415029` | Request changes: R-053, R-054 and R-061 (Major). The owner deferred the fixes of R-053 to R-058 (2026-10-22); no finding blocks B2 |

The log of every review, and the status of every finding: [README](README.md).

## Summary

The exit flow of B1 works on the demo: bootstrap, the invitation in Mailpit
over STARTTLS, the password, the sign-in, a second user, the IFU Manager role,
and one `platform_audit_record` row for each creation and grant. The
screenshots are in [`docs/plans/b1-exit/`](../plans/b1-exit/).

The test seams stay closed in `demo` and `production`. The Origin check, the
session checks on each request, the audit rows in the transaction, the mail
after commit and the migration with its triggers hold. R-049 and R-050 are
fixed.

The reviewer did not read the UI in full, nor the file service in depth, and
did not reproduce R-053 against a live Redis. The main session confirmed
R-053 and R-054 in the code.

Checks at `b415029`: `pnpm run typecheck` and `pnpm run lint` pass; the unit
and component tiers give 299 passed and 4 failed (only FND-09.AC2).

**Verdict: Request changes.** R-053, R-054 and R-061 are Major. On
2026-10-22 the owner deferred the fixes of R-053 to R-058 until the owner
calls for them, and changed `crisis_mode.md` §4 step 6: a finding is fixed
at once only when it blocks the next step of the build. No finding of this
review blocks B2.

## Findings

Line numbers are as of `b415029`.

### R-053 — Concurrent sign-ins pass the limits of DEC-027

- **Status:** **Open** (deferred by the owner, 2026-10-22) · **Severity:** Major · **Found:** review 4 (phase reviewer; confirmed in the code by the main session)
- **Where:** `src/modules/identity/services/session-service.ts:81-82` (`assertBelowLimit`, `assertNotLocked`), `:88` (`verifyPassword`), `:100-101` (`recordFailure`, `recordConsecutiveFailure`); `src/lib/rate-limit/index.ts`. The same pattern: `src/lib/auth/operator-request.ts:53-58`.
- **Problem:** the limit reads the count, the password check takes about 80 ms, and only then the failure is recorded. 50 concurrent sign-ins for one email address all pass the checks while the count is 0, so 50 passwords are tried where DEC-027 allows 5 (ACC-20 rule 3, AC3 to AC5).
- **Fix:** reserve the attempt in Redis before the password check, in one atomic step (`MULTI` or a script: add, then count); refuse over the limit; clear the reservation on a success. Do the same for the operator limit.

### R-054 — The session cookie has no Secure flag when PUBLIC_BASE_URL is http

- **Status:** **Open** (deferred by the owner, 2026-10-22) · **Severity:** Major · **Found:** review 4 (phase reviewer; confirmed in the code by the main session)
- **Where:** `src/lib/auth/session-cookie.ts:31`, `:42` (`secure: isPublicBaseUrlSecure()`); `compose.demo.yaml` (`PUBLIC_BASE_URL` default `http://localhost:3000`).
- **Problem:** ACC-20.AC1 and DEC-024 require `Secure`, and DEC-135 applies each rule of `production` to the demo. The demo answers a sign-in with `bp_session` without `Secure`.
- **Fix:** always set `Secure` on `bp_session` (a browser accepts it from `http://localhost`).

### R-055 — A direct caller can forge the source address

- **Status:** **Open** (waits for Q-15) · **Severity:** Minor · **Found:** review 4 (phase reviewer; plausible: needs the app port reachable without the trusted proxy)
- **Where:** `src/lib/security/origin.ts:81-83` (`resolveForwardedSource`); Next.js sets `X-Forwarded-For` only when the request has none.
- **Problem:** a new `X-Forwarded-For` on each request gives a new source count, so the limits by source of DEC-027 and FND-04 rule 4 do not hold (DEC-038). The lock by email address still holds. The demo binds the port to `127.0.0.1`.
- **Fix:** an owner decision (Q-15).

### R-056 — The server actions validate the input before they authenticate

- **Status:** **Open** (deferred by the owner, 2026-10-22) · **Severity:** Minor · **Found:** review 4 (phase reviewer; confirmed)
- **Where:** `src/app/_actions/identity.ts:72-73`, `82-83`, `92-93`, `106-108`, `120-121`.
- **Problem:** an anonymous call of `createUserAction({})` gets `VAL-4001` with the field details, not `AUTH-4100` (`sds-auth` › validation order). The route handlers use the correct order.
- **Fix:** call `requireCurrentActor()` before `parseWith(...)` in each session action.

### R-057 — A granted server action writes no SECURITY record

- **Status:** **Open** (deferred by the owner, 2026-10-22) · **Severity:** Minor · **Found:** review 4 (phase reviewer; confirmed)
- **Where:** `src/modules/identity/current-actor.ts:45-56`; the session actions of `src/app/_actions/identity.ts`. Compare `src/lib/http/route.ts:213-218`.
- **Problem:** the B1 contract (*Carried from step 2 to step 4*) asks for a `SECURITY` record for each granted session request. The interface calls only the actions, so no grant from the interface is logged.
- **Fix:** write the `INFO` `SECURITY` "session request granted" record in `requireCurrentActor`.

### R-058 — If the step after the commit fails, a password reset leaves the other sessions alive

- **Status:** **Open** (deferred by the owner, 2026-10-22) · **Severity:** Minor · **Found:** review 4 (phase reviewer; confirmed)
- **Where:** `src/modules/identity/services/credential-service.ts:120-122` (`endSessionsOfUser` in `afterCommit`); `src/lib/transaction/index.ts:60-66`.
- **Problem:** when Redis fails just after the commit, the password changes and each old session stays valid until it times out (ACC-11.AC2).
- **Fix:** `getSessionUser` refuses a session whose `createdAt` is before `password_changed_at`.

### R-059 — Two pages make a navigation with a GET form and a submit button

- **Status:** **Open** · **Severity:** Minor · **Found:** review 4 (phase reviewer; confirmed)
- **Where:** `src/app/(public)/page.tsx:37-41`; `src/app/backoffice/users/page.tsx:112`.
- **Problem:** a screen reader announces the link to `/sign-in` and to the new-user page as a button (`sds-nextjs-frontend` §5).
- **Fix:** a Next.js link with `buttonVariants` of `@heroui/styles`, as `AppLink` does with `linkVariants`.

### R-060 — Three commits that change tests carry Test-Exempt: acceptance

- **Status:** **Won't fix** (the history of the branch stays, as for R-045 and R-051) · **Severity:** Note · **Found:** review 4 (phase reviewer; confirmed)
- **Where:** `eae2f9f`, `270a6e0`, `b415029`.
- **Problem:** `sds-commit`: a commit that changes a test needs no trailer.
- **Fix:** none.

### R-061 — In the sidebar, the selected language can hardly be read, and the other language looks selected

- **Status:** **Open** · **Severity:** Major · **Found:** review 4 (main session, walk of the exit flow; measured in the browser)
- **Where:** the language switch in the `.sidebar-theme` region of `src/app/backoffice/layout.tsx` (`src/app/_components/language-switch.tsx` or its sidebar wrapper). Screenshot: `docs/plans/b1-exit/07-user-list.jpg`.
- **Problem:** the selected item ("Türkçe") has dark green text (`oklab(0.47 …)`) on a 15 % green fill over the dark sidebar. The item that is not selected ("English") has the solid fill and white text, so it looks selected. This fails WCAG 2.2 AA on a primary flow (DEC-018) and shows the state the wrong way.
- **Fix:** in the `.sidebar-theme` region, give the selected item the strong fill and the other item the quiet style, with token pairs of `src/app/globals.css` that meet AA. Add no color (DEC-015).

### R-062 — The letter of the brand mark in the sidebar does not show

- **Status:** **Open** · **Severity:** Minor · **Found:** review 4 (main session, walk of the exit flow)
- **Where:** `src/app/_components/brand-mark.tsx` in the sidebar of `src/app/backoffice/layout.tsx`. Screenshot: `docs/plans/b1-exit/07-user-list.jpg`.
- **Problem:** the DOM holds the letter "B", but the square shows empty on the screen.
- **Fix:** make the letter visible with a token pair of `globals.css` that meets AA in the `.sidebar-theme` region.

### R-063 — At a width of 1024 px, the user list scrolls sideways and cuts the last column

- **Status:** **Open** · **Severity:** Minor · **Found:** review 4 (main session, walk of the exit flow)
- **Where:** `src/app/backoffice/users/page.tsx` (`DataTable` with `min-w-[720px]`). Screenshot: `docs/plans/b1-exit/07-user-list.jpg`.
- **Problem:** with the 256 px sidebar, the "Created" column is cut at 1024 px.
- **Fix:** let the columns wrap (or drop the minimum width) so that six columns fit at 1024 px.

## Earlier findings

- **R-049:** fixed in `270a6e0`. `authenticateOperator` runs steps 2 to 4 first and throws `AUTH-5500` only after them; the two developer tests follow.
- **R-050:** fixed in `b415029`. The fakes are typed with `satisfies Partial<typeof import(...)>`; the fake `toDatabaseError` returns an `AppError`.
- **R-052:** unchanged (due in B4).

## The builder's choices

- No foreign key on `platform_audit_record.actor_user_id`: accepted. The contract names none, DEC-004 sets the module boundary, and a trigger refuses each `DELETE` of `identity_user`.
- The operator failure limit fails open when Redis is down: no rule covers it (Q-16).
- The reset mail is sent detached: it follows DEC-033 and helps ACC-11.AC1. A known address still runs a transaction that an unknown address does not, so the time differs by a few milliseconds.
- The transaction helper is in `src/lib/transaction`: accepted; the layering rules pass.
- The common-password list has 41 entries: it follows DEC-137 as written (Q-17).
- The test clock is on `globalThis`: accepted; only the seam writes it.
- `src/prisma/migrations/app/refs/db.json` is committed: correct (Prisma 8 skill).
