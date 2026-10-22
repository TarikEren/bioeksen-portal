# Review 7 — Stage B4: phase review in crisis mode

| # | Date | Scope | Base | Verdict |
|---|---|---|---|---|
| 7 | 2026-10-22 | The phase review of B4 (DEC-136, `crisis_mode.md` §4 step 5): the commits `fd21ef8..0e979be` (the contract, the mock skeleton, the page, the backend). One `code-reviewer` agent; the main session checked R-095, R-096 and R-097 in the code before it recorded them. R-102 comes from the walk of the exit flow on the demo (§5) | `0e979be` | Request changes: R-095, R-096 and R-097 (Major); the reviewer says that R-095 blocks the test phase |

The log of every review, and the status of every finding: [README](README.md).

## Summary

The exit flow of B4 works on the demo. A visitor with no session opens `/` and
then `/eifu`, sees the full consent text with its version `draft-1`, the draft
marker and a consent box that is not ticked. The visitor sends the inputs
without consent (400 `VAL-4006` under the box), then with consent, gets the code
mail in Mailpit (Turkish and English, the code, the catalog number and the LOT
number, no link), sends one wrong code (4 attempts remain) and the right code,
and gets the version `05` of `KTL-0042` with one PDF link for each language
(`en`, `tr`). A link downloads the PDF as `KTL-0042-rev05-tr.pdf`. A second
lookup with a LOT of another catalog number shows `LOT_CATALOG_MISMATCH` with
its text and code. Each lookup has its access record (the inputs, the outcome,
the version id, the consent version, `email_verified`, the request id, the key
id, the email address not in plain text). `/eifu` answers with
`X-Robots-Tag: noindex` and loads nothing from another host. On the demo
database, each named constraint and index of `catalog.md` and `eifu.md` exists,
each controlled table has its triggers, and DELETE and TRUNCATE are refused
(FND-06.AC3 to AC5). Screenshots: [`docs/plans/b4-exit/`](../plans/b4-exit/).

The reviewer checked: the verification step reads no catalog data, so its
answer does not depend on the inputs (IFU-50 rule 3); the code (`randomInt`, a
keyed HMAC, `timingSafeEqual`, 10 minutes, one use); the identity encryption
(AES-256-GCM, a random nonce, the key id as additional data; the lookup hash
with the pepper); the access record in the transaction of the lookup, `DB-5001`,
the URLs signed after the commit; the code mail awaited after the commit; the
worker jobs; the truncation of DEC-139; the resolution of IFU-60 rule 2; the
module boundary; the page rules.

Checks at `0e979be`: `pnpm run typecheck` and the lint of the changed paths
pass; the unit tests of `src/lib/logging`, `src/modules/catalog` and
`src/lib/http` pass. Not verified: the race of R-096 (it needs the integration
tier); keyboard use, contrast and axe on the page.

**Verdict: Request changes.** R-095, R-096 and R-097 are Major. The reviewer
says that R-095 blocks the test phase (`crisis_mode.md` §6): the clock seam
cannot move the windows of DEC-072, so a test of IFU-50.AC8 needs more than 30
minutes of real time. Under §4 step 6, each finding waits for the call of the
owner. R-097 needs an answer to Q-19 first.

## Findings

Line numbers are as of `0e979be`.

### R-095 — The limits of DEC-072 use fixed windows on the clock of Redis

- **Status:** **Open** (the reviewer says it blocks the test phase; waits for the owner's call) · **Severity:** Major · **Found:** review 7 (phase reviewer; confirmed in the code by the main session)
- **Where:** `src/lib/rate-limit/index.ts:160-188` (`assertUnderQuota`, `consumeQuota`: `INCR` and `PEXPIRE … NX`); `src/modules/eifu/services/verification-service.ts:120-131`; `lookup-service.ts:211`. The header of the file (`:24-26`) and `src/lib/clock/index.ts:2-4` say that the rules read `now()`.
- **Problem:** a window starts at the first request and does not slide, so one address can get 6 code mails in 10 minutes and 1 second (1 at 10:00:00, 2 at 10:09:59, 3 at 10:10:01); the same holds for 10 a day and 20 an hour by source. The window is the TTL of Redis, so the clock seam cannot move it, and a test of IFU-50.AC8 needs more than three windows of real time. A request that a later counter refuses still counts in the earlier counters.
- **Fix:** one sliding-window quota scored by `now()`, as `assertBelowLimit` and `recordFailure` do; check and add all the counters of a request in one atomic step (a Lua script, or `WATCH`/`MULTI`).

### R-096 — The code is compared against a row read with no lock, so concurrent lookups can test more than five codes

- **Status:** **Open** · **Severity:** Major · **Found:** review 7 (phase reviewer; confirmed in the code by the main session; the race was not run)
- **Where:** `src/modules/eifu/services/lookup-service.ts:213-230` (the read with no lock at `:214`, the compare at `:223`); `:81-91` (`registerWrongCode`); `verification-repository.ts:156-169` (`markVerificationUsed`).
- **Problem:** N lookups at the same time for one verification all read `attempts_used = 0` and compare their codes; the wrong codes wait for the row lock, and the correct code wins when its conditional update gets the lock first. So N codes are tried where DEC-071 and IFU-51.AC4 allow five. The source limit caps N at 30 for each source; with many sources (or R-055) a guessed code writes an access record with `email_verified = true` for an address that the caller does not control.
- **Fix:** lock the row (`FOR UPDATE`) before the compare and count the try under the lock; on the correct code, mark the verification used and insert the access record in the same transaction.

### R-097 — A visitor can make the portal send a Bioeksen mail that holds any text, a URL included, to any address

- **Status:** **Open** (waits for Q-19) · **Severity:** Major · **Found:** review 7 (phase reviewer; confirmed in the code by the main session)
- **Where:** `src/modules/platform/services/mail-service.ts:152-180` (`renderCodeMail`: the inputs go into the text); `verification-service.ts:83-96` (`requestFaults`: a length of at most 64 and no NUL); `src/lib/schemas/lookup.ts:105-106`.
- **Problem:** `catalogNumber: "https://evil.example/odeme"` and `lotNumber: "Hesabiniz askiya alindi"` reach a victim's address in a mail from Bioeksen; a mail client makes the URL a link. IFU-50.AC2 and PLT-20 rule 2 say the code mail has no link. With the source limit, 20 recipients an hour for each source.
- **Fix:** an owner decision on the characters of a catalog number and a LOT number at the verification (Q-19); a format check gives the same answer whether the number exists or not. Or the mail leaves out a value that holds `://`, `www.` or `@`.

### R-098 — The body schema runs before the rate limit

- **Status:** **Open** · **Severity:** Minor · **Found:** review 7 (phase reviewer; confirmed)
- **Where:** `src/lib/http/route.ts:240`, `:273` (`load` parses the body before the handler); `src/app/_actions/lookup.ts` (`parseWith` first); `lookup-service.ts:211`.
- **Problem:** the 31st lookup from one source with a body that fails the schema gets 400 `VAL-4006`, not 429 (IFU-51.AC10; `sds-auth` › validation order); requests that fail the schema never count. Same kind as R-056.
- **Fix:** count the source limit in the route and the action before the schema, or record a departure.

### R-099 — Two service headers say that no log record holds a verification id, but a failure record logs the path

- **Status:** **Open** · **Severity:** Note · **Found:** review 7 (phase reviewer; confirmed)
- **Where:** the claim in `verification-service.ts:24-25` and `lookup-service.ts:28-29`; the log in `route.ts:156-160` (`path=request.nextUrl.pathname`).
- **Problem:** a failed `GET /api/v1/eifu/verifications/{id}` (500, 503 or 405) logs the id. FND-05 rule 5 does not list the id, so the comments are wrong.
- **Fix:** log the route pattern instead of the path, or correct the comments.

### R-100 — The key move reads the whole access-record table on each hourly pass

- **Status:** **Open** · **Severity:** Note · **Found:** review 7 (phase reviewer; plausible: depends on the size of the table)
- **Where:** `access-record-repository.ts:71-78`; `verification-repository.ts:185-191`; no index on `identity_key_id`.
- **Problem:** `identity_key_id <> $1 … ORDER BY id LIMIT 500` reads every row, also when the result is empty; the table keeps 10 years of records (`sds-database` §6).
- **Fix:** skip the pass when the ring has one key, or add a partial index.

### R-101 — Commit 0e979be is a chore with Test-Exempt: acceptance

- **Status:** **Won't fix** (the history of the branch stays, as for R-092) · **Severity:** Note · **Found:** review 7 (phase reviewer; confirmed)
- **Fix:** none.

### R-102 — The draft consent text says that the visitor can give a first and last name, which the page does not ask for

- **Status:** **Open** (for the owner and the legal function) · **Severity:** Minor · **Found:** review 7 (main session, walk of the exit flow; seen on the page)
- **Where:** the dictionary group `lookup` (the consent text of the mockup, DEC-098); the page `/eifu`. Screenshot: `docs/plans/b4-exit/02-verification-step.jpg`.
- **Problem:** the text says "Adınızı ve soyadınızı isterseniz verirsiniz; zorunlu değildir", but DEC-077 says that the public lookup collects no first name and no last name, and the page has no such field.
- **Fix:** the legal function removes the sentence when it writes the text (DEC-074); or the owner allows the removal from the draft now.

## Earlier findings

- **R-055:** still open; B4 now uses the source address for the limits of DEC-072 and for the client address in each verification and access record (IFU-80.AC5).
- **R-077:** the comment of the `eifu_lookup` migration (`migration.ts:17-21`) makes the same claim; no test covers it yet.
- **R-053, R-088:** not repeated: the counters use an atomic `INCR`, and the lookup transaction writes only through `tx`.

## Questions

- **Q-19 (R-097):** Which characters may a catalog number and a LOT number have at the verification step? CAT-30 gives no character set.
- **Q-20:** For `OVERRIDE_TARGET_NOT_PUBLISHED` and `NO_FILE_FOR_VERSION`, the access record stores the id of a version that gave no document (`lookup-service.ts:184`, `resolution.ts:150`, `:175`). IFU-80 rule 2 says "the resolved version". Is that what the spec intends?
