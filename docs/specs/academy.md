# Bioeksen Portal — Academy

This file holds the decisions and the outline items of the Academy, the
training platform of release 2. The decisions are in force now, so that release 1 builds nothing
that release 2 must undo. Each item gets its full rules, data and criteria
before stage B6 starts.
Read `README.md` first. It explains the IDs, the decision status and the build order.

## Decisions

Each row is one decision. The **Decision** column gives the rule that is in
force. A *Pending* rule stays in force until the owner answers.

### Organizations and access

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-100 | The Academy needs a sign-in, with the accounts of DEC-023. Nobody creates their own account. | Decided | PO | — | ACD-10 | eng/academy-domain.md §Authentication |
| DEC-101 | An organization is `INTERNAL`, `DEPARTMENT`, `CUSTOMER` or `DISTRIBUTOR`. Bioeksen is the one `INTERNAL` organization. A department has exactly one parent: the `INTERNAL` organization. A distributor supplies a customer through an active `DISTRIBUTES_TO` relationship. A customer with no distributor is a direct customer of Bioeksen. | Default | ENG | — | ACD-10 | eng/organization-model.md; eng/data-model-fields.md §Organization |
| DEC-102 | A grant scoped to an organization reaches only downward. It reaches the organization and the customers that the organization supplies. When the organization is the `INTERNAL` organization, the grant also reaches the departments of the organization. An `INTERNAL` grant also reaches each customer that no distributor supplies. It never reaches upward or sideways. | Default | ENG | — | ACD-10, ACD-50 | eng/organization-model.md §What a scoped grant reaches |
| DEC-103 | Only a holder of `iam.role.manage` grants a content role or an IFU role. A holder of the scoped permission `iam.role.assign` grants only the roles Learner and Organization Manager, inside their scope. If a role does not apply to an organization type, the system refuses it there, for every granter. | Decided | PO | — | ACD-10 | eng/permission-matrix.md §Role assignment scope (decided 2026-08-23) |

### Courses

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-104 | A course version moves `DRAFT` → `IN_REVIEW` → `APPROVED` → `PUBLISHED` → `SUPERSEDED`. An unpublished version can move to `DISCARDED`, with a reason. The review, the approval and the publication are three separate acts. Published content never changes: a change is a new version. | Decided | PO | — | ACD-20, ACD-70 | eng/academy-domain.md; eng/state-machines.md §CourseVersion |
| DEC-105 | The author of a course version never approves it. The roles of the author do not change this rule. A database constraint also holds this rule. | Decided | PO | — | ACD-20 | eng/permission-matrix.md §Why Content Author holds approve |
| DEC-106 | Each publication answers three separate questions. What happens to a learner who started the course version and did not complete it before the publication (`ALLOW_GRACE_PERIOD` or `MOVE_IMMEDIATELY`)? What happens to a learner who completed (`NO_ACTION`, `ASSIGN_NEW_VERSION` or `REQUIRE_RECERTIFICATION`)? What happens to a certificate that exists (`KEEP_UNTIL_EXPIRY`, `EXPIRE_AFTER_GRACE_PERIOD` or `EXPIRE_IMMEDIATELY`)? | Decided | PO | — | ACD-20, ACD-60 | eng/academy-domain.md §Versioning |
| DEC-107 | A course names the products that it covers, many to many. There is no product-family level. | Default | ENG | — | ACD-20 | adr/0012 §An Academy course links to many products |

### Content and results

| ID | Decision | Status | Owner | Ask | Affects | Trace |
|---|---|---|---|---|---|---|
| DEC-108 | A course can embed a video from YouTube or Vimeo. The block holds the provider and the video id, never a URL. The block shows a cover. The page contacts the provider only when the learner presses play, through `youtube-nocookie.com` or with `dnt=1`. This rule is an exception to DEC-006. The Academy needs its own consent text for it. | Pending | LEG | questions.md 18 | ACD-30 | adr/0019; audit D-2 |
| DEC-109 | Release 2 does not build a self-hosted video block. An embedded video needs a localized summary as an alternative to the video, because the portal cannot require captions on another host. | Pending | PO | questions.md 19 | ACD-30 | adr/0019; eng/learning-engine.md; eng/accessibility.md §Video; audit D-6 |
| DEC-110 | A certificate names the exact course version that the learner completed. A public page verifies it by a random UUID. A revoked certificate stays, and verifies as revoked. | Decided | PO | — | ACD-60 | eng/project-overview.md §12 |
| DEC-111 | 3D simulation is part of a second stage, for standard interactions only. It is never the only path to a required learning objective. | Decided | PO | — | ACD-30 | eng/project-overview.md §14; eng/threejs-simulations.md |
| DEC-112 | The server computes each score and ignores a score that a client sends. A learner never receives an answer key. A submitted attempt never changes. | Default | ENG | — | ACD-40, ACD-30 | eng/testing.md §What an assessment test is actually for |

## Organizations and courses

These are outline items. In the acceptance criteria, "fails" means that the
system refuses the action with the code that the criterion names, and no row
changes.

### ACD-10 Organizations and scoped access

**What.** Organizations, memberships and role grants scoped to an
organization.

**Rules.**
1. Organizations follow DEC-101. Scoped grants follow DEC-102 and DEC-103.
   The platform-wide grants of release 1 stay (DEC-029).
2. The system audits each grant and each revocation (PLT-40).
3. After sign-in, the system offers the Academy to each holder of
   `academy.learning.participate` (DEC-026, DEC-100).

**Acceptance.**
- **AC1.** If a person creates a department under another department, the
  creation fails with 400 `VAL-4006`.
- **AC2.** When an Organization Manager is scoped at a distributor, the
  manager sees the users of the customers that the distributor supplies. The
  manager does not see the users of other customers.
- **AC3.** If a holder of `iam.role.assign` without `iam.role.manage` grants
  the Content Author role, the grant fails with 403 `PERM-4150`.
- **AC4.** When a manager is scoped at one department, the manager cannot act
  on the `INTERNAL` organization or on another department.
- **AC5.** If a relationship names Bioeksen as the distributor, it fails with
  400 `VAL-4006`.

**Trace.** eng/organization-model.md; eng/permission-matrix.md

### ACD-20 Courses and versions

**What.** Courses and their versions, from the draft to the publication.

**Rules.**
1. The lifecycle follows DEC-104 and DEC-105. Publication follows DEC-106.
2. A course has at most one unpublished version. A version gets its number at
   publication.
3. The course content in two languages follows DEC-011. A version goes to
   review only with both languages.
4. A course names its products (DEC-107, DEC-001).

**States.**

| State | TR | Owner |
|---|---|---|
| `DRAFT` | *Taslak* | author |
| `IN_REVIEW` | *İncelemede* | reviewer |
| `APPROVED` | *Onaylandı* | publisher |
| `PUBLISHED` | *Yayında* | nobody |
| `SUPERSEDED` | *Yerine yenisi geçti* | nobody |
| `DISCARDED` | *Vazgeçildi* | nobody |

**Acceptance.**
- **AC1.** When an author sends a draft with both languages to review, the
  draft gets `IN_REVIEW`. If a required text is not in both languages, the
  move fails with 400 `VAL-4001`.
- **AC2.** If the author of a version approves it, the approval fails with 403
  `PERM-4150`, also when the author is a Platform Administrator.
- **AC3.** When another qualified person approves the version, it gets
  `APPROVED`. Learners cannot see the version until its publication.
- **AC4.** When a person publishes a new version, the previous version gets
  `SUPERSEDED`. Each completion and each certificate keeps the version that it
  names.
- **AC5.** If a person discards a published version, the move fails with 409
  `RES-4302`. When a person discards a draft with a reason, it gets
  `DISCARDED`.
- **AC6.** When an author links a course to three products, the course names
  the three products.

**Trace.** eng/academy-domain.md; eng/state-machines.md §CourseVersion

## Learning

These are outline items. In the acceptance criteria, "fails" means that the
system refuses the action with the code that the criterion names, and no row
changes.

### ACD-30 Content blocks

**What.** The block-based content of a lesson. The system validates it against
a registry in code.

**Rules.**
1. Each block type has a schema in a registry in code. An author completes the
   schema and never supplies a script (DEC-002).
2. Video follows DEC-108 and DEC-109. 3D follows DEC-111.
3. When a learner reads a block, the data that the learner gets never holds
   the answer key of the block (DEC-112).
4. Each drag-and-drop activity has a keyboard path (DEC-018).

**Acceptance.**
- **AC1.** If a person saves a block whose configuration does not match its
  schema, the save fails with 400 `VAL-4006`.
- **AC2.** When a learner reads a quiz block, the answer holds no answer key.
- **AC3.** When a lesson with an embedded video loads, the page makes no
  request to the provider until the learner presses play.
- **AC4.** When a learner uses only the keyboard, the learner completes a
  drag-and-drop activity.

**Trace.** eng/learning-engine.md; eng/interactive-content.md; adr/0019

### ACD-40 Assessments

**What.** Assessments with server-side scores, attempt limits and
remediation.

**Rules.**
1. Scores and attempts follow DEC-112.
2. An assessment can set:
   - a minimum score to pass;
   - a maximum number of attempts;
   - a retry delay;
   - a remediation that a learner completes before the next attempt.

**Acceptance.**
- **AC1.** When a learner submits wrong answers with a claimed score of 100,
  the stored score is the one that the server computes.
- **AC2.** If a person changes a submitted attempt, the change fails with 409
  `RES-4302`.
- **AC3.** If a learner used the maximum number of attempts and starts
  another attempt, the start fails with 409 `RES-4302`. This also applies
  while an earlier attempt is open.
- **AC4.** If a failed attempt requires a remediation lesson, the next
  attempt fails with 409 `RES-4302` until the learner completes the lesson.

**Trace.** eng/academy-domain.md §Assessments; eng/testing.md

### ACD-50 Assignments and enrollments

**What.** Required and optional training for a user or an organization.

**Rules.**
1. An assignment targets one user or one organization. It is `REQUIRED` or
   `OPTIONAL`. A due date is optional, also for a `REQUIRED` assignment.
2. An Organization Manager assigns only inside their scope (DEC-102).
3. When a person withdraws an assignment, the system deactivates it and keeps
   its enrollments (DEC-010).

**Acceptance.**
- **AC1.** When a manager assigns a required course with no due date to an
  organization, each active member gets the course as required. The course
  has no due date for them.
- **AC2.** If a manager assigns a course to a user outside their scope, the
  assignment fails with 403 `PERM-4152`.
- **AC3.** When a person withdraws an assignment, it stays with `isActive`
  false. The progress and the certificates of the learners stay.
- **AC4.** When a person assigns a course as optional, a learner of the target
  can start it without another approval.

**Trace.** eng/academy-domain.md §Assignment; eng/data-model-fields.md §Assignment

## Certificates and authoring

These are outline items. In the acceptance criteria, "fails" means that the
system refuses the action with the code that the criterion names, and no row
changes.

### ACD-60 Certificates

**What.** Certificates that name the completed version, and their public
verification.

**Rules.**
1. Certificates follow DEC-110. Publication policies follow DEC-106.
2. A revocation needs a reason. The system audits each revocation. Superseded
   content expires a certificate. It never revokes a certificate.

**Acceptance.**
- **AC1.** When a learner completes a course version that gives a
  certificate, a certificate exists that names that version.
- **AC2.** When a person opens the public verification page with the
  certificate's UUID, the page shows `VALID`, `EXPIRED` or `REVOKED`, with no
  sign-in.
- **AC3.** When a person revokes a certificate with a reason, the row stays.
  The public page shows `REVOKED`.
- **AC4.** When a person publishes a version with `EXPIRE_IMMEDIATELY`, the
  certificates of the earlier version get `EXPIRED`, not `REVOKED`.

**Trace.** eng/project-overview.md §12; eng/deferred-work.md §1.4

### ACD-70 Training Studio

**What.** The area of the backoffice where authors build courses.

**Rules.**
1. An author edits the module, lesson and block tree of a draft (DEC-104).
2. Each reorder has a keyboard path (move up, move down) (DEC-018).
3. An author previews the learner's view, and sends the draft to a chosen
   reviewer. A reviewer comments on the version or on one block.

**Acceptance.**
- **AC1.** When an author moves a lesson with the "move up" control, the order
  changes, with no drag.
- **AC2.** When an author previews a draft, the page shows it as a learner
  sees it, and records no progress.
- **AC3.** When an author sends a draft to a reviewer, that reviewer sees it
  in their review list.
- **AC4.** If a person edits a version that is not `DRAFT`, the edit fails
  with 409 `RES-4302`.

**Trace.** eng/training-studio.md

### ACD-80 Academy notifications

**What.** In-app and email messages about training obligations.

**Rules.**
1. Messages follow DEC-033. The system sends each message after the commit,
   never inside it.
2. A message is in the preferred language of the recipient. It holds no data
   of people outside the scope of the recipient.
3. A user cannot mute a message about an assignment, a deadline or a
   revocation.
4. Each message has a deduplication key, so a repeated job sends it once.

**Acceptance.**
- **AC1.** When a person assigns a course to a user, the user gets an in-app
  message and an email in their preferred language.
- **AC2.** When the job that sends due-date reminders runs twice for one
  period, each learner gets one reminder.
- **AC3.** If a user mutes the category of assignment messages, the user
  still gets the message of a new required assignment.

**Trace.** eng/notifications.md
