# Deferred Work

Known, deliberate gaps. Each entry says what is missing, why it was left, what
it costs to leave, and what "done" looks like — enough to pick up cold.

Three categories, and the first is the one that matters most:

- **Drift** — documentation promises behaviour the code does not have. This is
  worse than an unbuilt feature, because a reader has no way to tell.
- **Blocked** — waiting on information only Bioeksen has.
- **Not built** — absent and never claimed otherwise. Harmless.

Section 1 began as a list of what the previous implementation got wrong. Every
entry on it has been closed by building the thing on the TypeScript backend.
What remains is current, not historical.

---

## 1. Drift

**None known.** Not the same claim as "none", and the difference was earned.

On 2026-09-06 this section said **None**, and an external review of the whole
codebase found two entries that belonged in it by this document's own
definition — documentation promising behaviour the code did not have:

- ADR-0008 puts LOT date parsing in exactly one tested function. That function
  was the only genuinely orphaned export in the backend: imported by its own
  spec and by nothing else. The write path took the date from the request body,
  compared it with nothing, and recorded `PARSED_FROM_LOT` for a date nothing
  had parsed.
- `organization-model.md` and `permission-matrix.md` describe organization
  scoping. `organizationsInScope` and `canReach` were written, documented and
  tested, and called from nowhere; all 57 `@RequirePermission` sites passed no
  organization.
- The same gap again, on the WRITE side of assignments, found later. The
  reading routes were narrowed and `POST /assignments` was not: it carried
  `@RequirePermission('academy.assignment.manage')` with no scope, which the
  guard reads as "platform-wide only". So an Organization Manager — who holds
  that permission in `permission-matrix.md`, at an organization — could not
  assign a course at all, while the controller's docblock said they assigned
  within their scope. `targets` returned every organization in the deployment
  to anybody who could assign anything. Now `SCOPED_BY_QUERY` with the handler
  narrowing, refusing an out-of-scope target with
  `ASSIGNMENT_TARGET_OUT_OF_SCOPE`.

All three are closed. None was visible from this file, from the tests, or from
any of the eight governance checks, because each was a *connection* that was
never made rather than a thing that was never built — the tests covered both
ends and nothing asked whether they met.

That is why the heading is now **None known**. A section that claims to have
found everything is making the same kind of promise the entries beneath it
warn about.

Two entries are kept as notes rather than as work, because each is the clearest
statement anywhere of a rule that is easy to get wrong a second time. They
describe closed gaps.

### 1.1 A LOT override with no reason and no audit trail

> **Closed on 2026-09-05.** `LotOverrideService` and
> `/api/v1/lot-overrides` exist, gated on `eifu.lot_override.manage`, always
> requiring a reason and always audited. An override pointing at an
> unpublished version is now refused at creation as well as at resolution:
> one that can never resolve is a control that looks applied and is not.
> The entry is kept because it is the clearest statement anywhere of why
> that gap mattered.

### 1.4 Publication does not apply its learner and certificate policies

> **Closed on 2026-09-05.** `Enrollment`, `LessonCompletion` and `Certificate`
> exist, and `CoursesService.publish` applies all three policies in the
> publication transaction. The trap this entry named — a grace period must never
> *extend* an existing `expires_at` — has its own test, and the certificate is
> marked `EXPIRED` rather than `REVOKED`, because superseding content is not
> misconduct and the public verification result must not imply it was.
>
> Kept, rather than deleted, because it is the clearest statement of why the
> three questions are separate.

## 2. Blocked on Bioeksen

None of these are engineering work. They are questions with owners.

One of these was resolved by a decision rather than by an answer: the explicit
IVD/RUO column is no longer needed, because products are entered by hand and
the operator states the status (section 3).

| Needed | For | Consequence of not having it |
|---|---|---|
| `kit_code_base` for 322 products | ADR-0013 kit-code check | 265 products go unchecked; 57 can be inferred from existing lots but should be confirmed, not trusted |
| GHS / TGHS / VGHS products | Animal and food health lines | 37 lot records reference products that do not exist |
| Updated lot export | Full lot history | Only 57 of 322 products have lot data |
| 7 product-name spelling conflicts | Product grouping | A rule is needed for which name wins, unless corrected at source |
| 4 kit-code anomalies confirmed | ADR-0013 | Unclear whether they are data errors or real exceptions. Listed in ADR-0013's follow-up |
| Whether `GHS-CF03S/04S/06S/07S` should be `VGHS-` | ADR-0013 | All four are vCAP-behaving products under a prefix meaning lyophilized |
| A superseding ADR resolving ADR-0007's internal contradiction | Retention policy | See below |
| The Academy consent text | ADR-0019 | Playing an embedded video sends the learner's IP address to YouTube or Vimeo. The e-IFU consent text covers the e-IFU flow and says nothing about this. The block itself already tells the learner, in the cover, before they press play — so the gap is the written consent, not the disclosure |
| Quality's rule for an import that disputes a registered LOT's date | ADR-0008 §6 | A daily import that supplies another date for a LOT already registered is `CONFLICT_REVIEW_REQUIRED` and writes nothing -- the registered date keeps selecting the IFU until somebody acts on the report. ADR-0008 §6 could be read as asking for the LOT itself to be flagged (`has_date_conflict`), which would stop resolving it at once; one typo in a daily file would then take a LOT in use offline. Which of the two is right is quality's call, and it belongs in the ADR |
| `OPERATOR_JWT_ISSUER`, `OPERATOR_JWT_AUDIENCE`, `OPERATOR_JWKS_URL` | `GET /metrics` moving behind `OperatorGuard` | Until then the scrape endpoint takes a shared `METRICS_TOKEN`. It fails closed when unset, so the posture is right; the mechanism is the interim one |

### ADR-0007 contradicts itself, and only its owners can fix it

Found on 2026-09-06 while building the retention job. The record says both of
these:

| Where | What it says |
|---|---|
| *Current position* table, *Decision* items 1–2 | "No automatic deletion is implemented." "Current operational retention: **Indefinite**." |
| *Consequences* and *Alternatives considered* | "A bounded, defensible retention period replaces open-ended retention." "It simply stops naming people after five years." Indefinite retention is "**superseded** by this decision." |

The date line — "2026-08-22, retention period decided 2026-08-23" — and the
business-owner line say the period *was* decided. So the second half is the
current one and the first half is text left behind by an edit the record itself
notes was made while it was still `Proposed`.

Since overtaken: ADR-0016 set retention to indefinite, and ADR-0018 then set
it to ten years, configurable, the row never deleted — which is what is built.
ADR-0007's contradiction no longer decides anything, but the record still
reads as the authority on the question until its owners supersede it.

**This is not an engineering decision and the ADR is not edited to fix it.**
`docs/adr/README.md`: an accepted ADR is superseded by a new one, never edited.
The legal and business owners named in ADR-0007 write that record. Until they
do, the stale sentences stand in a document that is otherwise the authority on
a compliance question — which is the reason this entry exists rather than a
quiet correction.

---

## 3. Not built, and not claimed

No drift here; these are simply absent.

- **`MATCHING` questions.** The type is in the `question_type` enum, the
  registry grades it, and no author can add one and no learner can sit one. The obstacle is the shape, not the widget: `options` carries
  both sides of the pairing in one flat list, and which side an option is on
  exists only inside `correct_answer` — which is stripped from everything a
  learner reads, on purpose. So a learner is sent four options with nothing
  saying that two of them are the things to be paired and two are what to pair
  them with. Closing it means the type saying which side an option is on, in
  the schema, plus a migration for any row already written. The seed carried
  one of these questions in the catalogue exam, which made an 80%-pass paper
  unpassable; that is fixed, and the seed's own types are now narrowed to the
  four that can be answered so the compiler refuses the next one. The API
  refuses it too now: `AUTHORABLE_QUESTION_TYPES` leaves it out of
  `question-types` and `addQuestion`, and an existing row still grades.
- **Renaming the `bo-` prefix.** It no longer means "backoffice": the shared
  component vocabulary lives in `styles/components.css` and is rendered by the
  Academy player, the e-IFU screens, the Studio and the identity forms. The
  rules moved and the names did not, because renaming a class used in
  fifty-four files is churn with real risk and no visible benefit — but the
  name still misleads on first reading. `ui-` is the obvious replacement, and
  it is a mechanical change worth doing on its own rather than inside a
  behavioural one.
- **Undo in the Studio.** The BioBI report designer has undo/redo and the
  Studio does not. It is not a missing button: every action here is a server
  write, so real undo needs either a command log with an inverse per action or
  optimistic local state that can diverge from the database. A half-working
  undo in controlled training content is worse than none — an author who
  believes a change was reverted and finds it published is the failure mode.
  Wanted, not free, and not started.
- **Password reset for somebody locked out. Closed.** `AuthToken` issues a
  single-use, expiring token that is emailed as a link;
  `POST /auth/password-reset` asks for one and `POST /auth/password-reset/complete`
  spends it. The request endpoint answers 204 whether or not the address has an
  account, so it cannot be used to ask which addresses are Bioeksen customers.

  The same table closed a second thing in the same change: **an account's first
  password**. `POST /users` used to return a `temporary_password` for the
  administrator to convey by whatever channel they had, so the first credential
  of every external account was one somebody else chose, knew, and sent over a
  messaging app. It now returns no password at all and sends an invitation.
- **A breach-corpus check on passwords.** `password-policy.ts` rejects a
  handful of obvious values from a list in the file. A real deployment should
  check the Pwned Passwords k-anonymity range API or a local dump; the list is
  not a substitute and says so.
- **LOT entry from a table. Closed.** LOTs are pasted or uploaded (CSV or
  XLSX), for every product at once or from one product's page, previewed row by
  row, and written only on confirmation -- with the report `ImportBatch` and
  `ImportRowResult` were modelled for (`eifu-imports.md`). The kit-code check of
  ADR-0013 runs there, at the import boundary.
- **Content block types with no editor.** `pcr_curve` and `plate_setup` are in
  the backend registry, validated and playable, and the Studio has no form for
  either — an author cannot create one from the UI. The palette lists them as
  needing a separate editor rather than hiding them. The learner-side renderers
  are absent too, so a block created by another route would show as
  "cannot be displayed in this build".

  **`pcr_curve` and `plate_setup` are closed.** Both now have an authoring form
  and a learner renderer, which had to arrive together: a form with no renderer
  produces blocks nobody can read, and a renderer with no form has nothing to
  read. A plate is a grid of buttons that cycle through empty, sample, positive
  and negative; a curve set is a plot with a **range input** for the threshold
  rather than a draggable line, because a block about reading results must be
  usable without a pointer. No registered type is in this state any more.
- **Self-hosted `video`.** Was the last type in the registry with no form and
  no renderer — the server validated and stored it, and it rendered as the
  "cannot display this" placeholder. Bioeksen decided on 2026-09-14 that
  embedding (`video_embed`, ADR-0019) is enough, so it moved to
  `PLANNED_BLOCK_TYPES`: creating one is now refused with
  `CONTENT_BLOCK_TYPE_UNKNOWN` and `details.planned`, rather than accepted and
  shown as nothing. Still unbuilt, and what it would need is unchanged —
  something to upload a video, caption files per locale, and a size limit that
  is not `MAX_IMAGE_BYTES`. The case that brings it back is an internal SOP
  recording that may not go to a public platform.

- **Progress and analytics reporting. Closed.** `analytics.report.view` now
  gates `GET /analytics/usage` and `GET /analytics/academy`, and
  `organization.progress.view` gates
  `GET /analytics/organizations/:organizationId/progress`. No registered
  permission is without an endpoint any more. What remains unasked is the
  question this entry raised — nobody has said what a training report is FOR,
  so what exists answers "how is the platform being used" rather than "is this
  organization's competence record complete".
- **Operator endpoints.** `GET /api/health` (the full report) and
  `GET /api/admin/logs` are described by `sds-auth` and are unreachable:
  `operator.guard.ts` refuses every request because `OPERATOR_JWT_ISSUER` and
  `OPERATOR_JWKS_URL` are unset until Bioeksen supplies an issuer, and
  `/api/admin/logs` has no controller at all. Failing closed on a credential
  that cannot be verified is the correct behaviour and not the gap; the gap is
  that the operator surface is 0% functional and this was not written down
  anywhere until now. `live` and `ready` are unaffected and are what a load
  balancer uses.
- **Product master import from the catalogue export.** **Decided against, on
  2026-09-06.** Products are entered one at a time through the backoffice, with
  the operator choosing the regulatory status and the format explicitly.

  The analysis in ADR-0012 stands and the export is still the source the
  operator reads from. What was rejected is deriving identity from it. Measured
  against the real file: 408 of 573 catalog numbers end in `R` and 322 carry
  "RUO" in their name, and **the two signals disagree on 102 rows** — `R` is a
  revision digit in `BS-SY-MX24T-25R1`, sits mid-code in `CANCL-R-T-25`, and
  `BS-SY-SI-100R` ends in `R` with no RUO anywhere in its name.

  An importer would therefore have had to guess the regulatory status for 102
  products, and a wrong guess merges an RUO variant with its IVD twin — which
  resolves a laboratory to the wrong IFU, the single failure this product
  exists to prevent. Typing 573 rows once is cheaper than one of those.
- **Verifying that the email address is real. Closed** (ADR-0018). A
  one-time code is sent to the address and the document is released only after
  it is entered, so the identity on the access record is one somebody
  demonstrated. The cost the entry named is real and now operational: an SMTP
  outage stops every download, which is why email failures are alerted on
  (`docs/operations/monitoring.md`) and have a runbook
  (`docs/operations/incidents.md`).

- **An erasure screen.** `POST /api/v1/privacy/erasure` exists, is audited and
  is permission-gated; nothing in the backoffice calls it, so an administrator
  runs it with `curl` (`docs/operations/incidents.md`). Requests are rare and
  the procedure is written down; a form is worth adding once they are not.
- **Rate limiting at the edge.** Limits are enforced in the backend, per
  address and per recipient, in Redis. nginx has no `limit_req`: keyed on
  `$remote_addr` it would see only the TLS proxy, and keying it on the
  forwarded address needs `real_ip` trusted to exactly that proxy, which is a
  per-host decision. Whatever terminates TLS is the better place for a coarse
  flood limit.
- **Academy content in the Content-Security-Policy.** The policy in
  `infra/nginx/security-headers.conf` was written for e-IFU. Course images
  served from signed object-store URLs and `video_embed` frames need `img-src`
  and `frame-src` entries for those origins before `ACADEMY_ENABLED=true` is
  switched on in production; until then the Academy is off and its routes
  answer 404.
- **Images and actions pinned by digest.** Base images (`node:26-alpine`,
  `nginx:1.27-alpine`, `postgres:16-alpine`, `redis:7-alpine`) and GitHub
  actions are pinned by tag, so a rebuild can pull different bytes under the
  same name. Pinning by digest needs something to move the pins forward
  (Dependabot or Renovate), or it freezes security fixes out instead.
- **The monitoring stack.** The backend exports what to alert on and
  `docs/operations/monitoring.md` gives the rules; no Prometheus, alert route
  or external uptime check ships with the composition. Which one is Bioeksen's
  choice.

- **Conflict detection across uploaded documents.** Proposed on 2026-09-06:
  parse uploaded PDFs and report where two documents disagree — the same
  product described differently in two revisions, a LOT range claimed by two
  files, an instruction that changed without a revision. Nothing is designed
  yet, and it comes after the Three.js work. Recorded here so it is not
  rediscovered as a new idea.
- **Who may see a quiz's correct answers in the backoffice.** Today any holder
  of `academy.assessment.manage` can read `correct_answer` on any question of a
  course they can see, and `CourseAudience` narrowed which courses that is but
  not who, within Bioeksen, may read the key to one. Bioeksen wants the option
  of restricting some quizzes to their own author — the person who wrote it,
  not the role. That is a per-assessment setting and a second check inside
  `AssessmentsService`, which is already the only service permitted to read the
  column; the shape is known, the rule is not decided. Asked for 2026-09-14,
  explicitly as later work.
- **A distinct outcome for lots predating portal coverage.** Bioeksen decided
  not to load IFUs from before the portal existed, so lots older than the first
  revision return `EIFU_NO_APPLICABLE_VERSION`. That is technically correct and
  reads to a user as "no document exists for your product". A separate outcome
  would be honest to the user and distinguishable from a real data gap in
  analytics. Proposed, never decided — treat as an open question, not a plan.

---

## Before removing an entry

Delete it here in the same change that closes it, and update whatever the
entry says is drifting. An entry that outlives its gap is the same failure in
the opposite direction.
