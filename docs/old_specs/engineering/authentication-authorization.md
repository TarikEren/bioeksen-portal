# Authentication and Authorization

## Authentication

Initial Academy login: email + password.

Architecture should allow later MFA/one-time email verification without reworking identity fundamentals.

## Roles

Conceptual role bundles:

- Learner
- Organization Manager
- Content Author
- Reviewer
- Quality Approver
- Content Administrator
- IFU Manager
- Platform/System Administrator

A user may hold multiple roles.

## Permissions

Prefer granular capabilities, for example:

- `academy.course.create`
- `academy.course.edit_draft`
- `academy.course.review`
- `academy.course.approve`
- `academy.course.publish`
- `academy.assignment.manage`
- `eifu.document.manage`
- `eifu.document.replace_published_file`
- `eifu.lot_override.manage`
- `organization.users.view`
- `organization.progress.view`

Backend authorization is authoritative.

## Separation of duties

An author cannot approve their own CourseVersion.

Administrative breadth must not bypass required audit/versioning controls.

The transport mechanism is session cookies with CSRF protection; see **ADR-0003**. Its decision stands; the implementation is now Express sessions in Redis with a double-submit CSRF token (ADR-0015).

There is one sign-in for everyone. Where a person lands afterwards is decided
by the permissions they hold, not by which door they came through; see **ADR-0011**.

The exhaustive permission registry and role bundles are in `permission-matrix.md`. The list above is illustrative; that file is normative.
