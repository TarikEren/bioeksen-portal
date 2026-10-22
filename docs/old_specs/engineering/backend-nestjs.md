# Backend Rules

NestJS on Node, TypeScript, Prisma against PostgreSQL (ADR-0015). ESM
throughout, because NestJS 12 ships ESM-only.

These rules survived the rewrite from Django unchanged. Only the framework they
are expressed in was obsolete, which is why the file they came from was kept
until this one replaced it.

## Layering

Controllers are thin. They parse the request, call one service function, and
shape the response. They contain no business rule, and a rule that appears in
one is a rule the next caller will not get.

Business workflows are explicit service functions, named for what they do:

- `EifuService.resolve(...)`
- `DocumentsService.replacePublishedFile(...)`
- `CoursesService.submitForReview(...)`, `.approve(...)`, `.publish(...)`
- `CertificatesService.issueManually(...)`, `.revoke(...)`
- `AssignmentsService.assign(...)`

**Nothing sets a status field directly.** Every transition in
`state-machines.md` is owned by exactly one function, and that function is where
the guard, the audit event and the side effects live together. A second write
path is a second set of rules that will drift.

## Validation

Request bodies are parsed with zod through `parseBody`, which turns a failure
into a `VALIDATION_ERROR` carrying one `details` entry per field (ADR-0014).
One helper rather than one per controller: the mapping from a zod issue to a
`{field, issue}` entry is the envelope's contract, and a second copy is a second
place for it to drift.

Authored configuration — content blocks, question types, completion rules — is
validated against a registry that lives in code. An author picks a type and
fills in its schema; there is no path from an authoring form to running their
code. That line is what separates this from a SCORM player.

## Transactions

`prisma.$transaction` for anything that must succeed or fail together:
publication, file replacement, every version transition, assignment and the
enrolments it produces, issuing a certificate.

The audit event goes **inside** the same transaction as the change it records.
An audit trail written afterwards is one that is missing exactly the records
that mattered — the ones where something failed halfway.

## Errors

A service throws a `DomainError` carrying a registered code from
`error-codes.md`. It does not throw an HTTP exception, does not know its own
status, and does not phrase anything a user reads: `message` is an English
developer string and the frontend renders the translation of `code`.

`details` is `null` unless the failure is a validation error. Retry timing goes
in the `Retry-After` header, where HTTP already puts it. Anything else a code
wants to say, the caller re-reads from the resource.

## Constraints belong in the database

Use a database constraint for every invariant that can be expressed as one.

Prisma cannot express `CHECK`, a partial unique index, or `EXCLUDE USING gist`,
so those are hand-written SQL in their own migrations —
`database-migrations.md` covers the discipline that requires.

The service checks the same rule, and both are wanted. The service explains: a
caller gets a code saying which of their choices does not work. The database
makes it impossible: a caller that skipped the service still meets it. A rule
enforced only in the service is a convention; a rule enforced only in the
database reaches the user as an unhandled error and a 500.

## Background work

There are no signals and no implicit hooks. Something that must happen as part
of a workflow happens in that workflow's function, where it can be read.

Scheduled work — expiring certificates, anonymising retained e-IFU access
records — is an explicit service function that can be called from a test.

## Reading and writing the same data

Where a read is served to two audiences, the two reads are two functions with
two shapes, not one function with a flag.

`AssessmentsService.learnerQuestions` cannot return `correct_answer`, because
`LearnerQuestion` has no such field. `ActivityAttemptsService.learnerBlocks`
strips each block's answer key through its registry entry. The authoring reads
of both live in different controllers behind authoring permissions, and they
deliberately return the key.

A single function with `includeAnswers: boolean` is one call site away from
handing a learner the answers.

## Administration

There is no admin autogenerator and no equivalent of Django Admin. Everything
an operator needs is a screen with a permission, or it does not exist. That is
more work and it is the point: an admin surface is a second authorization model
nobody tests.
