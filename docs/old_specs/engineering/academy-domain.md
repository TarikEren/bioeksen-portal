# Academy Domain

## Authentication

Academy requires authenticated accounts created/managed by authorized administrators in the initial release.

## Course lifecycle

`DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED -> SUPERSEDED`

Review, approval, and publication are separate business actions.

An author cannot approve their own CourseVersion. Approval is not restricted to a
single job title: another Content Author, a Quality Approver, a Content
Administrator or a Platform Administrator may approve. The requirement is that a
second qualified person approves, and `actor != created_by` is what enforces it.

## Versioning

Published CourseVersion content is not edited in place. Create a new draft
version. Historical progress and certificate linkage are preserved.

A version number belongs to a published version. Work in progress carries none
and is identified by its id until it is released, so an abandoned attempt leaves
no gap in the sequence.

An unpublished version can be **discarded** with a reason. Without that, a
course whose author changed their mind would be locked forever: only one
unpublished version may exist at a time, and the only other way out of `DRAFT`
is publication. A published or superseded version can never be discarded —
released content is superseded, not erased.

Publishing asks three separate questions, and they have different answers and
different owners. See `state-machines.md`.

In-progress policy — what happens to someone **part-way through**. Chosen by the
publisher at publication, because it depends on what changed:

- `ALLOW_GRACE_PERIOD` (default) — finish the version you started, within N days
- `MOVE_IMMEDIATELY` — start again on the new version

New-version policy — what happens to someone who **already completed** it. Chosen
by the author:

- `NO_ACTION`
- `ASSIGN_NEW_VERSION`
- `REQUIRE_RECERTIFICATION`

Existing-certificate policy — what happens to **certificates already issued**.
Consulted only under `REQUIRE_RECERTIFICATION`:

- `KEEP_UNTIL_EXPIRY` (default)
- `EXPIRE_AFTER_GRACE_PERIOD`
- `EXPIRE_IMMEDIATELY`

Requiring retraining and voiding an existing credential are separate business
decisions. Publishing a new version does not expire a valid certificate unless
the course explicitly says so. See `state-machines.md`.

## Products a course covers

A course references the products it applies to, chosen when the course is
authored. Product granularity is finer than training needs — one panel course
may cover six products, since format and regulatory status both split a product
for e-IFU purposes — so the relationship is many-to-many and there is no
product-family level (ADR-0012).

## Assignment

Target an individual User or Organization.

Requirement:

- `OPTIONAL`
- `REQUIRED`

Due date is optional.

Authorized Organization Managers may manage assignments/deadlines within their permitted scope.

## Completion

Configurable completion rules may require all lessons, selected activities, assessments, or combinations.

## Assessments

Support configurable passing score, max attempts, randomization, answer visibility, retry delay, and remediation. A failed final quiz may require repetition of a lesson/module/course section before another attempt.

## Certificates

Certificates are optional and linked to the exact CourseVersion.

Support validity, expiry, revocation, public verification, and My Certificates.

Allowed transitions, guards, required permissions and side effects are tabulated in `state-machines.md`.
