# Notifications

The `notifications` domain exists in `architecture.md` but had no rules. This is them.

## Scope

Notifications are **operational**: they tell a user that something in the system
requires or concerns them. They are not marketing, and they are not analytics.

Explicitly out of scope: product-update marketing and newsletters.

**One e-IFU message exists, and it is the only one** (ADR-0018): a six-digit
verification code, sent before a document is released, so that the address on an
access record is one somebody proved rather than one they typed. Until
2026-09-07 this section said the e-IFU flow never sends a message at all, and
the reason it said so still holds for everything else — a lookup must not become
a marketing surface, and no other e-IFU event sends anything.

The cost of the exception is stated in ADR-0018 rather than hidden here: a mail
server is now on the path to a regulatory document, and monitoring delivery is a
production requirement.

## Channels

| Channel | Status | Notes |
|---|---|---|
| In-app | Primary | Always written, regardless of email delivery. |
| Email | Secondary | Best-effort. Delivery failure never fails the business transaction. |

SMS and push are out of scope. Do not add a channel without an ADR.

## Catalogue

| Event | Recipients | Channels |
|---|---|---|
| `course_version.submitted_for_review` | Assigned reviewer | in-app, email |
| `course_version.returned_to_draft` | Author | in-app, email |
| `course_version.approved` | Author, publisher role holders | in-app |
| `course_version.published` | Author | in-app |
| `assignment.created` | Assigned user, or members of the assigned organization | in-app, email |
| `assignment.due_soon` | Assigned user, or members of the assigned organization | in-app, email |
| `assignment.overdue` | Assigned user, their organization managers | in-app, email |
| `certificate.issued` | Certificate holder | in-app, email |
| `certificate.expiring_soon` | Holder, their organization managers | in-app, email |
| `access_request.submitted` | The Bioeksen staff responsible for the requester's distributor, else every decider | in-app, email |
| `access_request.approved` | The requester (mandatory) | in-app, email |
| `access_request.rejected` | The requester, with the reason (mandatory) | in-app, email |
| `certificate.revoked` | Holder | in-app, email |
| `import.completed_with_conflicts` | Uploader | in-app, email |
| `document_version.published` | IFU manager role holders | in-app |
| `account.invited` | The person whose account was created | email |
| `account.password_reset_requested` | The address that asked | email |

## Rules

1. **Never inside the transaction.** A notification is a secondary effect. Enqueue
   it after the transaction commits, never inside it. A failing mail server
   must not roll back a publication — or, for `account.invited`, an account
   that was created.
2. **Not an ORM lifecycle hook.** Notification dispatch is called explicitly from
   the service function that owns the transition. A hook fires on every write,
   including the ones a migration or a repair script makes, and nobody wants a
   data fix to email six hundred learners.
3. **Localized per recipient.** Rendered in the recipient's `preferred_language`
   using translation keys, never with a hard-coded string in the service
   (`localization.md`).

   **The two account messages are the exception, and they are bilingual in one
   body instead.** Their recipient may never have signed in, so there is no
   stored preference to read — the same reasoning as the e-IFU verification
   code, and the same shape: both languages, one message.
4. **No sensitive payloads.** An email carries a subject, minimal context and a
   link into the portal. It never carries a document file, a signed storage URL,
   a certificate PDF, or a password.

   `account.invited` and `account.password_reset_requested` carry a link whose
   query string is a single-use token, which is the rule holding rather than
   bending: the link is the context, it is useless once spent or expired, and
   the alternative it replaced was emailing an actual password. The host in
   that link comes from `PUBLIC_BASE_URL` and never from the request's `Host`
   header — a header an attacker chooses would point the link in a real
   message at their own server.

   **One exception, and it is the whole of the exception:** the e-IFU
   verification code (ADR-0018). It is a token, which this rule otherwise
   forbids. The rule's reasoning — that a message is not a secure channel and
   must not carry a key to anything — is why that code is six digits,
   single-use, valid for ten minutes, destroyed after five wrong guesses, and
   useless without the `verification_id` it was issued against. It carries no
   link and no URL. Nothing else may claim this exception without an ADR.
5. **No personal data of third parties.** An organization manager's overdue
   digest names their own members only, and only within their permitted scope.
6. **Idempotent.** Every notification carries a deduplication key
   (`{event}:{entity_id}:{recipient_id}:{period}`). A retried job must not send
   twice.
7. **Deliverability is not correctness.** Delivery status is logged and
   monitored (`logging-observability.md`); it is never written to the audit trail.
   Notifications are not `AuditEvent` records (`audit-traceability.md`).
8. **Preferences.** Users may mute non-mandatory categories. Assignment,
   deadline and certificate-revocation notifications are mandatory and cannot be
   muted, because they carry a training obligation.

## Scheduled notifications

`assignment.due_soon`, `assignment.overdue` and `certificate.expiring_soon` are
produced by periodic jobs in `SchedulerService`, which already runs four of
them behind a distributed lock. Each run is bounded, batched, and idempotent
for its period. Never load the full assignment table into memory
(`performance.md`).

`assignment.due_soon`, `assignment.overdue` and `certificate.expiring_soon` are
built and run in that pass. Each job pages through every due row in a stable
order rather than reading a capped batch. The deadline reminders reach the
assigned person, or every active member of the assigned organization and its
active departments who has not completed the course. `certificate.expiring_soon`
and `assignment.overdue` reach the **holder or learner only**; the managers this
table also names are a query about who manages whom within a permitted scope
(rule 5), and it is not written.

## What is built

`notification-registry.ts` is this catalogue as code, and the module asserts at
load that every event declaring `email` has a message and no event has one it
will never send. Raised today:

| Event | Raised by |
|---|---|
| `assignment.created` | `AssignmentsService.announce`, after the controller's transaction |
| `assignment.due_soon`, `assignment.overdue` | `SchedulerService`, daily while overdue and once per deadline |
| `certificate.issued` | The certificate controller and both completion paths |
| `certificate.revoked` | The certificate controller |
| `certificate.expiring_soon` | `SchedulerService`, once per expiry date, 30 days ahead |
| `access_request.*` | `CatalogueService`, after the transaction that submits or decides |

The `course_version.*`, `import.*` and `document_version.*` rows are in the
registry and nothing raises them yet: the events exist, the messages exist, and
the services that own those transitions do not call `notify`. That is a
connection never made rather than a thing never built, which is the shape
`deferred-work.md` warns about — so it is written down here.
