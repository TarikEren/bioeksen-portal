# Permission Matrix

This file is the **exhaustive** permission registry. `authentication-authorization.md`
lists examples; this file lists all of them.

Never invent a permission code inline. Add it here first, in the same change.

## Rules

- The authorization check is always against a **permission code**, never a role name.
- A role is a bundle of permissions and carries no authority of its own.
- Permissions marked *org-scoped* are evaluated against the target object's
  organization via an active `RoleAssignment` for that organization. A
  platform-scoped assignment (`organization IS NULL`) satisfies any scope.
- A permission marked **not** org-scoped has no organizational dimension at
  all. Bioeksen owns the content, so there is no such thing as creating a course
  "in" an organization. Granting a role that carries such a permission against
  one organization therefore **does not narrow it** — the scope on the
  assignment has nothing to bite on.

  > To limit what someone may do, give them a role whose permissions are
  > scoped. A scoped assignment of an unscoped role looks like a limit and is
  > not one. This is why content and system roles are grantable only through
  > `iam.role.manage`: there is no safe way to hand them out "just for this
  > organization".
- Backend enforcement is authoritative. Frontend checks are UX only.

## Code format

`<domain>.<resource>.<action>` — lower case, dot separated, singular resource.

## Registry

### Academy — authoring

| Code | Org-scoped | Description |
|---|---|---|
| `academy.course.view` | no | View course and version metadata in the backoffice. |
| `academy.course.create` | no | Create a Course and its first draft version, and set its **audience** — who the course is offered to (`Course.audience`). The audience belongs to the course rather than to a version, so changing it needs no draft open and takes effect at once; it is held here rather than with `edit_draft` because deciding who training is for is the same authority as deciding it should exist. Holders also see every course whatever its audience: an author restricted by the field they set would watch their own course vanish as they saved it. |
| `academy.course.edit_draft` | no | Edit a `DRAFT` version's structure and content. |
| `academy.course.submit_review` | no | Move `DRAFT -> IN_REVIEW`. |
| `academy.course.review` | no | Comment on and complete review of an `IN_REVIEW` version. |
| `academy.course.approve` | no | Move `IN_REVIEW -> APPROVED`. Held by Content Author, Quality Approver, Content Administrator and Platform Administrator. **Always blocked for the version's own author**, for every one of them. |
| `academy.course.publish` | no | Move `APPROVED -> PUBLISHED` and supersede the previous version. |
| `academy.course.withdraw` | no | Return a version to `DRAFT` before approval. |

### Academy — assessments and blocks

| Code | Org-scoped | Description |
|---|---|---|
| `academy.assessment.manage` | no | Create/edit assessments and questions on a draft version. |
| `academy.content_block.manage` | no | Add, reorder, configure content blocks on a draft version. |

### Academy — delivery

| Code | Org-scoped | Description |
|---|---|---|
| `academy.assignment.manage` | yes | Create/modify assignments and due dates within scope. |
| `academy.enrollment.view` | yes | View enrollment and completion state within scope. |
| `academy.learning.participate` | no | Take courses, submit attempts. Held by every learner. |
| `academy.access_request.decide` | no | Approve or reject a learner's request for a catalogue course. **Bioeksen only**: held by Bioeksen roles, and the service also refuses a decider who is not a member of Bioeksen or one of its departments — the permission alone is not the rule. Approval creates an `OPTIONAL` assignment to the requester. |

### Academy — certificates

| Code | Org-scoped | Description |
|---|---|---|
| `academy.certificate.view_own` | no | View one's own certificates. Held by every learner. |
| `academy.certificate.view_scoped` | yes | View certificates of users within scope. |
| `academy.certificate.issue_manual` | no | Issue a certificate outside the automatic completion path. |
| `academy.certificate.revoke` | no | Revoke a certificate. Requires a reason; always audited. |

### e-IFU

| Code | Org-scoped | Description |
|---|---|---|
| `eifu.document.view` | no | View documents, versions and files in the backoffice. |
| `eifu.document.manage` | no | Create documents, versions, applicability periods; upload files. |
| `eifu.document.publish` | no | Publish a `DRAFT` version. |
| `eifu.document.withdraw` | no | Withdraw a published version from public resolution. |
| `eifu.document.replace_published_file` | no | Controlled correction of a published file. Requires a reason; always audited. |
| `eifu.lot_override.manage` | no | Bind a specific LOT to a specific version. Requires a reason; always audited. |
| `eifu.access_record.view_aggregated` | no | Aggregated e-IFU analytics dashboards. |
| `eifu.access_record.view_raw` | no | **Restricted.** Raw identifiable access records including email and IP. |

### Product master

| Code | Org-scoped | Description |
|---|---|---|
| `catalog.product.view` | no | |
| `catalog.product.manage` | no | Create/edit products. |
| `catalog.catalog_number.manage` | no | Create/edit catalog numbers, including bulk import. |
| `catalog.lot.view` | no | |
| `catalog.lot.manage` | no | Import LOTs and resolve import conflicts. |
| `catalog.lot.correct` | no | Correct a LOT's manufacturing date. Requires a reason; always audited. |

### Organizations and identity

| Code | Org-scoped | Description |
|---|---|---|
| `organization.organization.view` | yes | |
| `organization.organization.manage` | no | Create/edit organizations and relationships. |
| `organization.responsibility.manage` | no | Make a Bioeksen employee responsible for a distributor, or end it. Routing only: requests from that distributor and the customers it supplies go to them first; deciding still takes `academy.access_request.decide`, and only a Bioeksen member who holds it can be made responsible. Who is responsible is read with `academy.access_request.decide`, never by the distributor. |
| `organization.users.view` | yes | List users within scope. |
| `organization.users.manage` | yes | Create/deactivate users within scope. |
| `organization.progress.view` | yes | Training progress reporting within scope. |
| `iam.role.assign` | yes | Assign roles within scope, restricted by the allow-list in *Role assignment scope* below. Always audited. |
| `iam.role.manage` | no | **Restricted.** Define roles and their permission bundles. |

### Platform

| Code | Org-scoped | Description |
|---|---|---|
| `audit.event.view` | no | Read the audit trail. No permission grants write or edit access. **No endpoint checks this yet** — see `deferred-work.md` §1.2. |
| `analytics.report.view` | yes | Aggregated analytics within scope. |
| `analytics.event.view_raw` | no | **Restricted.** Individual analytics events with the visitor identifier and the client address decrypted. The counterpart of `eifu.access_record.view_raw`, held by the same single role and for the same reason: an event feed carrying addresses is a surveillance surface, and the aggregates every dashboard is built from need none of it. |
| `platform.system.administer` | no | System configuration and emergency operations. |

## Role bundles

`+` means the role holds the permission. Roles compose: a user may hold several.

Platform Administrator holds every business permission. Breadth of capability and
freedom from constraint are different things — the invariants below bind the
administrator exactly as they bind everyone else.

| Permission | Learner | Org Manager | Content Author | Reviewer | Quality Approver | Content Admin | IFU Manager | Platform Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `academy.learning.participate` | + | + | + | + | + | + | + | + |
| `academy.certificate.view_own` | + | + | + | + | + | + | + | + |
| `academy.course.view` | | + | + | + | + | + | | + |
| `academy.course.create` | | | + | | | + | | + |
| `academy.course.edit_draft` | | | + | | | + | | + |
| `academy.course.submit_review` | | | + | | | + | | + |
| `academy.course.review` | | | | + | + | + | | + |
| `academy.course.approve` | | | + | | + | + | | + |
| `academy.course.publish` | | | | | | + | | + |
| `academy.course.withdraw` | | | + | | | + | | + |
| `academy.assessment.manage` | | | + | | | + | | + |
| `academy.content_block.manage` | | | + | | | + | | + |
| `academy.assignment.manage` | | + | | | | + | | + |
| `academy.enrollment.view` | | + | | | | + | | + |
| `academy.access_request.decide` | | | | | | + | | + |
| `academy.certificate.view_scoped` | | + | | | | + | | + |
| `academy.certificate.issue_manual` | | | | | | + | | + |
| `academy.certificate.revoke` | | | | | | + | | + |
| `eifu.document.view` | | | | | | | + | + |
| `eifu.document.manage` | | | | | | | + | + |
| `eifu.document.publish` | | | | | | | + | + |
| `eifu.document.withdraw` | | | | | | | + | + |
| `eifu.document.replace_published_file` | | | | | | | + | + |
| `eifu.lot_override.manage` | | | | | | | + | + |
| `eifu.access_record.view_aggregated` | | | | | | | + | + |
| `eifu.access_record.view_raw` | | | | | | | | + |
| `catalog.product.view` | | | + | | | + | + | + |
| `catalog.product.manage` | | | | | | | + | + |
| `catalog.catalog_number.manage` | | | | | | | + | + |
| `catalog.lot.view` | | | | | | | + | + |
| `catalog.lot.manage` | | | | | | | + | + |
| `catalog.lot.correct` | | | | | | | + | + |
| `organization.organization.view` | | + | | | | + | | + |
| `organization.organization.manage` | | | | | | | | + |
| `organization.responsibility.manage` | | | | | | | | + |
| `organization.users.view` | | + | | | | + | | + |
| `organization.users.manage` | | + | | | | | | + |
| `organization.progress.view` | | + | | | | + | | + |
| `iam.role.assign` | | + | | | | | | + |
| `iam.role.manage` | | | | | | | | + |
| `audit.event.view` | | | | | | + | + | + |
| `analytics.report.view` | | + | | | | + | + | + |
| `analytics.event.view_raw` | | | | | | | | + |
| `platform.system.administer` | | | | | | | | + |

### Why Content Author holds `academy.course.approve`

Approval authority is not the constraint; **separation of duties** is. A Content
Author may approve a `CourseVersion` another author wrote, and may never approve
one they wrote themselves. Restricting approval to a dedicated Quality Approver
role would narrow the business requirement: Bioeksen's requirement is that a
second qualified person approves, not that a specific job title does.

The rule that actually protects the process is `actor != created_by`, enforced in
the service **and** by a database constraint (`state-machines.md`). It binds every
role in the table above, including Platform Administrator.

## Role assignment scope

`iam.role.assign` is the most dangerous permission in the registry, because it is
the one that can manufacture the others. It is always organization-scoped.

An Organization Manager may assign a role only when **all** of these hold:

1. The target organization is one they hold an active `RoleAssignment` for.
2. The role appears in the allow-list for that organization's type.
3. The resulting assignment is organization-scoped. An Organization Manager can
   never create a platform-scoped assignment (`organization IS NULL`).

### Which roles mean anything, by organization type

A separate question from who may grant one, and it was never asked. The
allow-list below answers *"may an Organization Manager grant this here"*; this
table answers *"does this role mean anything here at all"*, and it binds
**everyone**, `iam.role.manage` included.

| Organization type | Roles that are coherent there |
|---|---|
| `INTERNAL` | Learner, Organization Manager, Content Author, Reviewer, Quality Approver, Content Administrator, IFU Manager |
| `DEPARTMENT` | Learner, Organization Manager, Content Author, Reviewer, Quality Approver, Content Administrator, IFU Manager |
| `CUSTOMER` | Learner, Organization Manager |
| `DISTRIBUTOR` | Learner, Organization Manager |

Content and IFU roles exist only where there is Bioeksen content to act on.
A Content Author scoped at a customer is not dangerous — course editing is
platform-scoped, so the grant confers nothing — and that is exactly why it was
worth refusing: the interface offered a role, the person saw it listed against
their name, and it did nothing. A grant that promises an authority the system
will not honour is worse than a refusal, because nobody finds out until the
work does not happen.

**Platform Administrator is never organization-scoped.** It is platform-wide by
definition; scoping it to one organization produces a grant whose name says
"platform" and whose reach is one customer. It is absent from every row above
for that reason rather than as an oversight.

### Allow-list by organization type

| Organization type | Roles an Organization Manager may assign |
|---|---|
| `INTERNAL` | Learner, Organization Manager |
| `DEPARTMENT` | Learner, Organization Manager |
| `CUSTOMER` | Learner, Organization Manager |
| `DISTRIBUTOR` | Learner, Organization Manager |

`DEPARTMENT` gets the same two as any other type, and deliberately not more. A
department is inside Bioeksen and the instinct is to trust it further — but a
content role granted from anywhere organization-scoped is exactly the escalation
this allow-list exists to prevent, and being internal does not change what the
grant would reach.

**Never assignable through `iam.role.assign`, in any organization type:**
Content Author, Reviewer, Quality Approver, Content Administrator, IFU Manager,
Platform Administrator.

Those are Bioeksen content-ownership and system roles. Granting one from an
organization-scoped context would let a customer or distributor manager escalate
into authoring, reviewing, approving or publishing Bioeksen-owned content — the
exact boundary `organization-model.md` draws. They are granted only through
`iam.role.manage`, which is platform-scoped and held by Platform Administrator.

> **Decided 2026-08-23.** An `INTERNAL` Organization Manager may **not** assign
> Content Author, Reviewer or any other content role. Content and system roles are
> granted **only by a Platform Administrator**, through `iam.role.manage`.
>
> This keeps a single, auditable place where authority over Bioeksen-owned content
> is created. Content authority is not an organizational-management concern, even
> inside Bioeksen — and an Organization Manager who could mint Content Authors
> would be an approval-chain participant without ever appearing in one.

### Escalation invariants

These are absolute and are not overridable by any permission:

1. **No scope escalation.** A user may never create a role assignment whose scope
   exceeds their own delegation scope. Organization-scoped in organization X
   grants nothing in organization Y, and never grants platform scope.
2. **No privilege escalation.** A user may never grant a role carrying a
   permission they do not themselves hold in that scope. Assignment delegates
   authority; it never creates it.
3. **Distributor reach is explicit.** A distributor managing a customer's training
   requires an active `OrganizationRelationship` **and** the scoped permission. The
   relationship alone grants nothing, and it never widens the role allow-list.
4. Every role assignment and revocation writes an `AuditEvent`.

## Testing requirement

Every permission in this registry needs a positive and a negative test.
See `testing.md`.
