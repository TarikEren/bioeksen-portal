# Error Code Registry

`api-conventions.md` fixes the error envelope. This file fixes the **codes**.

Every error the API returns must use a code from this registry. Adding a code is
part of the change that introduces it — never emit an undocumented code, and
never reuse a code with different semantics.

## Envelope

```json
{
  "code": "EIFU_LOT_NOT_FOUND",
  "message": "Lot could not be resolved.",
  "details": {}
}
```

- `code` is a stable `UPPER_SNAKE` identifier. It is an API contract: renaming
  one is a breaking change.
- `message` is a non-localized English developer string. **The frontend never
  renders it to a user.** The frontend maps `code` to a translation key.
- `details` is a structured object, never a prose string. It must never echo
  back a secret, a password, or another user's personal data.

Validation failures use `details` for field errors:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request payload failed validation.",
  "details": { "fields": { "email": ["REQUIRED"], "lot_number": ["INVALID_FORMAT"] } }
}
```

## Frontend contract

Translation keys follow `errors.<lower_snake_code>`. An unmapped code falls back
to `errors.unexpected` and is reported to the console — it never renders the raw
code to the user.

## Where a code carries more than its name

`details` is `null` unless the failure is a **validation** error, in which case
it is an array of `{field, issue}` (ADR-0014). It is not a general-purpose
payload, so a code that needs to say more says it somewhere the shape allows:

| Wants to say | Says it |
|---|---|
| When to try again | The `Retry-After` header — `RATE_LIMITED`, `ASSESSMENT_RETRY_DELAY_ACTIVE` |
| Which fields were wrong | `details`, one entry per field |
| Anything else | Nothing. The caller re-reads the resource, which already holds it |

The third row is the one that takes discipline. `ASSESSMENT_REMEDIATION_REQUIRED`
used to promise `details.remediation_policy`; the caller has just tried to
attempt that assessment, so it can read the policy from the assessment rather
than have the error carry a copy that can disagree with it.

## The estate code every domain code maps to

ADR-0014: a caller receives the domain code from this registry, and the log
record written for the same failure carries a `bioeksen-sds` code from
`sds-logging/references/code-prefixes.md`. Both, always, for every failure.

They are not redundant. The domain code tells a **person** what to do next —
`COURSE_AUTHOR_CANNOT_APPROVE` and `COURSE_VERSION_NOT_DISCARDABLE` need
different Turkish, and the frontend picks it by code. The SDS code is what an
**operator** filters the aggregator by, and it is only useful because every app
in the estate uses the same thirty-eight values.

The mapping is a **rule, not a table**, so that adding a code does not mean
transcribing a value into two places:

1. If the code is in the override table below, that wins.
2. Otherwise, if it ends `_ALREADY_EXISTS`, `_ALREADY_ISSUED`,
   `_ALREADY_PROCESSED`, `_ALREADY_PUBLISHED`, `_ALREADY_ACTIVE`,
   `_ALREADY_SUBMITTED` or `_ALREADY_REVOKED` → **`RES-4300`**. The generic 409
   default means a *concurrent* write, which is a different failure.
3. Otherwise, if it ends `REASON_REQUIRED` → **`VAL-4001`**.
4. Otherwise, by HTTP status:

| HTTP | SDS code | |
|---|---|---|
| 400 | `VAL-4000` | |
| 401 | `AUTH-4101` | |
| 403 | `PERM-4150` | |
| 404 | `RES-4200` | |
| 405 | `VAL-4000` | no SDS equivalent exists |
| 409 | `RES-4301` | |
| 413 | `VAL-4000` | no SDS equivalent exists |
| 415 | `VAL-4000` | no SDS equivalent exists |
| 429 | `RATE-4400` | |
| 500 | `SYS-5000` | |
| 503 | `UP-5500` | |

405, 413 and 415 have no counterpart in the closed list at all. They take
`VAL-4000` because "the request as sent is unusable" is the nearest true
statement it can make — not because it is a good fit.

### Overrides

Where the closed list has something more precise than the status default:

| Domain code | SDS code | Why |
|---|---|---|
| `AUTHENTICATION_REQUIRED` | `AUTH-4100` | Missing, not invalid |
| `AUTH_SESSION_EXPIRED` | `AUTH-4102` | Expired, not invalid. One means refresh, the other means something is wrong |
| `AUTH_INVALID_CREDENTIALS` | `AUTH-4101` | A rejected credential, not a malformed payload |
| `AUTH_PROVIDER_UNAVAILABLE` | 503 | The identity provider could not be reached to verify an operator credential, or none is configured. Never returned for an end-user session. |
| `AUTH_PASSWORD_RESET_TOKEN_INVALID` | `AUTH-4101` | A reset token is a credential |
| `CSRF_FAILED` | `AUTH-4101` | So is a CSRF token |
| `AUTH_ACCOUNT_LOCKED` | `RATE-4400` | SDS's validation order step 1 is *"source is over its failed-authentication allowance"*. Saying so tells the caller to wait rather than to fix its credentials |
| `AUTH_PROVIDER_UNAVAILABLE` | `AUTH-5500` | SDS's validation order step 6 names exactly this: verification needs the identity provider and it cannot be reached. The 503 default `UP-5500` would say "upstream unavailable", which is true but tells an operator nothing about which upstream |
| `ROLE_ASSIGNMENT_OUT_OF_SCOPE` | `PERM-4152` | The target belongs to another principal |
| `ROLE_SELF_ASSIGNMENT_REFUSED` | `PERM-4152` | Same |
| `ASSIGNMENT_TARGET_OUT_OF_SCOPE` | `PERM-4152` | Same |
| `COURSE_NOT_ASSIGNED` | `PERM-4152` | Same |

`backend/src/http/domain-codes.ts` is generated from this file by applying that
rule. It is not hand-edited, and a governance check fails the build if the two
disagree.

## Generic — all endpoints

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Payload failed validation. Field detail in `details.fields`. |
| `AUTHENTICATION_REQUIRED` | 401 | No valid session. |
| `PERMISSION_DENIED` | 403 | Authenticated but lacks the required permission or scope. |
| `CSRF_FAILED` | 403 | Missing or invalid CSRF token. |
| `NOT_FOUND` | 404 | Resource does not exist, or the caller may not know that it does. |
| `METHOD_NOT_ALLOWED` | 405 | |
| `CONFLICT` | 409 | Generic state conflict. Prefer a specific code where one exists. |
| `PAYLOAD_TOO_LARGE` | 413 | |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | |
| `FILE_EMPTY` | 400 | An upload with no bytes. Separate from a type failure: the client sent nothing, rather than sending the wrong thing. The e-IFU document path predates this and keeps `EIFU_FILE_EMPTY`; new upload paths use this one. |
| `RATE_LIMITED` | 429 | Retry timing is in the `Retry-After` header. |
| `REASON_REQUIRED` | 400 | A reason-bearing controlled action was attempted without one. |
| `INTERNAL_ERROR` | 500 | Never leaks a stack trace or an internal identifier. |
| `SERVICE_UNAVAILABLE` | 503 | Dependency (database, storage, broker) unavailable. |

`NOT_FOUND` is deliberately returned instead of `PERMISSION_DENIED` where
disclosing existence would itself leak information.

## Authentication

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 400 | Wrong email or password. Never distinguishes which. |
| `AUTH_ACCOUNT_INACTIVE` | 403 | Account deactivated. |
| `AUTH_ACCOUNT_LOCKED` | 403 | Locked by brute-force protection. |
| `AUTH_SESSION_EXPIRED` | 401 | |
| `AUTH_PASSWORD_TOO_WEAK` | 400 | One `details` entry per unmet requirement, against the `password` field. The requirement names — `TOO_SHORT`, `TOO_LONG`, `CONTAINS_EMAIL`, `TOO_COMMON` — are translation keys, so all of them can be shown at once in the person's own language rather than discovered one rejection at a time. The policy is length-led with no composition rules, following NIST SP 800-63B: see `password-policy.ts`. |
| `AUTH_PASSWORD_UNCHANGED` | 400 | The new password is the current one. Refused rather than silently accepted: "changed" that changed nothing leaves somebody believing they have rotated a credential they have not. |
| `AUTH_PASSWORD_RESET_TOKEN_INVALID` | 400 | Covers expired and already-used tokens alike. |

## e-IFU — public resolution

These codes are also the `EIFUAccessRecord.outcome` values, so a failed lookup
stays analytically visible.

| Code | HTTP | Meaning |
|---|---|---|
| `EIFU_RESOLVED` | 200 | Success outcome. Recorded, not returned as an error. |
| `EIFU_CATALOG_NUMBER_NOT_FOUND` | 404 | No `CatalogNumber` matches the input. |
| `EIFU_LOT_NOT_FOUND` | 404 | No `Lot` matches the input. |
| `EIFU_LOT_CATALOG_MISMATCH` | 409 | The LOT exists but belongs to a different catalog number. |
| `EIFU_LOT_FORMAT_INVALID` | 400 | LOT does not match the documented Bioeksen pattern. |
| `EIFU_LOT_DATE_INVALID` | 400 | Encoded date segment is not a real calendar date. |
| `EIFU_VERIFICATION_NOT_FOUND` | 404 | The pending verification expired, was already used, or never existed. One code for all three: which it was is of no use to somebody legitimate and is a probe otherwise. |
| `EIFU_VERIFICATION_CODE_INVALID` | 400 | Wrong code. `details` carries how many attempts remain, because a person who mistyped needs to know whether to try again or start over. |
| `EIFU_VERIFICATION_TOO_MANY_ATTEMPTS` | 429 | Five wrong codes. The verification is destroyed rather than locked — there is nothing to unlock, and a new code means the guessing restarts against fresh digits. |
| `EIFU_VERIFICATION_SEND_FAILED` | 503 | The code could not be emailed. Reported as itself and never as a generic failure: a laboratory that cannot obtain its instructions must be told why, because what they do next depends on it. |
| `EIFU_LOT_DATE_CONFLICT` | 409 | Supplied and parsed manufacturing dates disagree; awaiting review. Never silently resolved. |
| `EIFU_NO_APPLICABLE_VERSION` | 404 | No published version covers this manufacturing date. **Never fall back to the newest revision.** |
| `EIFU_AMBIGUOUS_APPLICABILITY` | 409 | Overlapping applicability periods. A data defect; must be flagged, not guessed. |
| `EIFU_NO_FILE_FOR_VERSION` | 404 | Version resolved but has no active file. |
| `EIFU_LANGUAGE_NOT_AVAILABLE` | 404 | Requested language has no file for this version. Never substituted with another language. |
| `EIFU_NOTICE_NOT_ACKNOWLEDGED` | 400 | The legal/privacy acknowledgement was not accepted. |
| `EIFU_NOTICE_VERSION_STALE` | 409 | Acknowledged notice version is no longer current. |

## e-IFU — administration

| Code | HTTP | Meaning |
|---|---|---|
| `EIFU_DOCUMENT_ALREADY_EXISTS` | 409 | The document number is Bioeksen's quality-system identity and is unique. Two documents under one number is a question nobody in an audit can answer. |
| `EIFU_REVISION_ALREADY_EXISTS` | 409 | Revision labels are unique per document. |
| `EIFU_VERSION_NOT_DRAFT` | 409 | Attempted to edit a version that is not `DRAFT`. Files are added while a revision is a draft. A published one is corrected by replacing a file, which retains the previous and records a reason. |
| `EIFU_VERSION_ALREADY_PUBLISHED` | 409 | |
| `EIFU_APPLICABILITY_OVERLAP` | 409 | Would create overlapping periods for one product. `details.conflicting_ids`. |
| `EIFU_DOCUMENT_PRODUCT_REQUIRED` | 409 | Publication needs the document's product, and this document has none -- it predates the binding. Bind it (`POST /documents/:id/product`) and publish again. |
| `EIFU_DOCUMENT_PRODUCT_CHANGED` | 409 | Publication named the product the publisher was shown (`expected_product_id`), and the document has been bound to another since. Nothing was published; the publisher reviews the document and publishes again. |
| `EIFU_DOCUMENT_ALREADY_PUBLISHED` | 409 | The document's product cannot change: a revision has applied to it, and the periods, access records and overrides all name that product. The right document for another product is a new one. |
| `EIFU_REASON_REQUIRED` | 400 | A reason-bearing controlled action was attempted without a reason. Predates the generic `REASON_REQUIRED` and stays for the e-IFU actions already using it; new domains use the generic code. |
| `EIFU_FILE_LANGUAGE_ALREADY_PRESENT` | 409 | One active file per language per revision. A second is a replacement, which is a different act. |
| `EIFU_FILE_EMPTY` | 400 | An upload with no bytes. Separate from a type failure: it is a client that sent nothing, not a client that sent the wrong thing. |
| `EIFU_FILE_HASH_MISMATCH` | 400 | Uploaded bytes do not match the declared hash. |
| `EIFU_FILE_TYPE_REJECTED` | 415 | Server-detected content type is not permitted. |
| `EIFU_OVERRIDE_ALREADY_ACTIVE` | 409 | The LOT already has an active override. |
| `EIFU_OVERRIDE_TARGET_NOT_PUBLISHED` | 409 | Override target is a draft or withdrawn version. |
| `EIFU_OVERRIDE_TARGET_WRONG_PRODUCT` | 409 | The version has never applied to the LOT's product. An override sends a laboratory to a specific IFU instead of the one its date selects; sending it to another product's instructions is the one outcome e-IFU exists to prevent. |
| `EIFU_NO_PERIOD_TO_REOPEN` | 409 | Withdrawal asked to reopen the predecessor, but this version holds no open period. |

## Catalog and LOT import

| Code | HTTP | Meaning |
|---|---|---|
| `IMPORT_FILE_UNREADABLE` | 400 | Not valid CSV/XLSX. |
| `IMPORT_COLUMNS_MISSING` | 400 | `details` names each missing column (`field`: `catalog_number`, `lot_number`). |
| `IMPORT_ROW_LIMIT_EXCEEDED` | 413 | |
| `IMPORT_NO_ROWS` | 400 | The source is blank, or has a header row and nothing under it -- typically the downloaded template sent back unfilled. |
| `IMPORT_ALREADY_PROCESSED` | 409 | Same file hash already imported. |
| `CATALOG_NUMBER_ALREADY_EXISTS` | 409 | Catalog numbers are unique across the whole table — identity does not vary by country. |
| `CATALOG_NUMBER_BELONGS_TO_OTHER_PRODUCT` | 409 | |
| `LOT_ALREADY_EXISTS` | 409 | Exact duplicate; skipped with a warning at row level. |
| `LOT_CONFLICT_REVIEW_REQUIRED` | 409 | Duplicate with differing data. Never silently upserted. |

## Academy — lifecycle

| Code | HTTP | Meaning |
|---|---|---|
| `COURSE_ALREADY_EXISTS` | 409 | The course code is unique. It is how a course is referred to outside the system, so two under one code is a question nobody can answer. |
| `COURSE_INVALID_STATE_TRANSITION` | 409 | `details.from` / `details.to`. See `state-machines.md`. |
| `COURSE_AUTHOR_CANNOT_APPROVE` | 403 | Separation of duties. Not overridable by any permission. |
| `COURSE_REVIEWER_NOT_ASSIGNED` | 403 | |
| `COURSE_NOT_APPROVED` | 409 | Publication attempted before approval. |
| `COURSE_ALREADY_PUBLISHED` | 409 | |
| `COURSE_VERSION_NOT_EDITABLE` | 409 | Version is not `DRAFT`. |
| `LESSON_PAGE_NOT_ANSWERED` | 409 | A page of the lesson requires its scoreable blocks to be attempted, or answered correctly, before the learner goes past it (`page_break`). `details` names the blocks still owed — "something on page two" in a lesson of forty is a hunt. Enforced on completion as well as in the player, because a gate that lived only in the browser is bypassed by pressing "complete", and completion is what issues a certificate. |
| `COURSE_VERSION_NOT_PUBLISHED` | 409 | The mirror of the one above: a learner may only sit, complete or be certified against a `PUBLISHED` version. |
| `COURSE_HAS_NO_CONTENT` | 409 | Cannot submit an empty version for review. |
| `COURSE_HAS_INCOMPLETE_BLOCKS` | 409 | A block is missing something the published contract requires — a blank localized field, an image with no asset, a quiz with no answer marked. Draft blocks are deliberately allowed to be unfinished (`block-registry.ts`, `Strictness`), so this is where that stops. `details` names one entry per unfinished field, because "something is incomplete" in a course of forty sends somebody hunting. |
| `COURSE_ALREADY_HAS_UNPUBLISHED_VERSION` | 409 | A course may hold only one version in `DRAFT`, `IN_REVIEW` or `APPROVED`. Publish or discard it first. |
| `COURSE_VERSION_NOT_DISCARDABLE` | 409 | Published and superseded versions are superseded, never erased. |
| `CONTENT_BLOCK_TYPE_UNKNOWN` | 400 | Not in the block registry. |
| `CONTENT_BLOCK_CONFIG_INVALID` | 400 | Fails the block's schema. `details.schema_version`. |
| `CONTENT_BLOCK_SCHEMA_VERSION_UNSUPPORTED` | 400 | |
| `LOCALIZED_CONTENT_INCOMPLETE` | 400 | A required locale is missing. `details.missing_locales`. |
| `COURSE_AUDIENCE_INVALID` | 400 | An organization named as a course audience is not a Bioeksen department. A course is offered to a customer through an assignment, which is recorded, revocable and visible to that customer; an audience row is none of those things, so pointing one at a customer would be a second enrolment mechanism nobody can see. |
| `COURSE_AUDIENCE_EMPTY` | 400 | The audience is `DEPARTMENTS` and no department is named, which is a course visible to nobody — including its author, who would watch it vanish from every list with no error anywhere. |
| `COURSE_AUDIENCE_EXCLUDES_TARGET` | 409 | The person or organization being assigned the course is outside the audience its author chose. Distinct from `ASSIGNMENT_TARGET_OUT_OF_SCOPE`, which is about the caller's reach: this one refuses the combination no matter who asks. |

## Academy — learning

| Code | HTTP | Meaning |
|---|---|---|
| `ORGANIZATION_ALREADY_EXISTS` | 409 | Organization codes are unique across the whole table. |
| `ORGANIZATION_INACTIVE` | 409 | A deactivated organization takes no new members. Deactivation does not cascade: existing people, training and certificates are untouched. |
| `USER_ALREADY_EXISTS` | 409 | Email address identifies an account. |
| `USER_CANNOT_DEACTIVATE_SELF` | 409 | An administrator who deactivates themselves cannot undo it, and in a single-administrator deployment that ends administration. |
| `USER_INACTIVE` | 409 | The account is deactivated, so there is nothing to invite them back into. Distinct from `AUTH_ACCOUNT_INACTIVE`, which answers somebody trying to sign in; this answers an administrator acting on somebody else. |
| `USER_ALREADY_ACTIVATED` | 409 | They have already opened this account, so there is no invitation to re-send — their way back in is the reset they can start themselves. An administrator who could re-issue an account-opening link for a live account could take that account over. |
| `ROLE_ASSIGNMENT_NOT_PERMITTED` | 403 | The role is not on the allow-list for that organization type, or a platform-wide grant was attempted without `iam.role.manage`. `iam.role.assign` is the permission that manufactures the others. |
| `ROLE_ALREADY_ASSIGNED` | 409 | They already hold that role in that scope. |
| `ROLE_NOT_ASSIGNED` | 409 | The grant is already revoked. Revoking deactivates, so the history of who held what survives. |
| `CATALOG_PRODUCT_ALREADY_EXISTS` | 409 | Identity is `(internal_code, regulatory_status)`; the same code may exist once as IVD and once as RUO (ADR-0012). |
| `CATALOG_LOT_ALREADY_EXISTS` | 409 | Uniqueness is `(catalog_number, lot_number)`, never `lot_number` alone. |
| `ENROLLMENT_NOT_FOUND` | 404 | |
| `ENROLLMENT_GRACE_PERIOD_EXPIRED` | 403 | The version was superseded and the learner's grace period to finish it has run out (`ALLOW_GRACE_PERIOD`). Distinct from `ENROLLMENT_NOT_FOUND`: they *were* enrolled, and saying so is what tells them to start the new version rather than that they were never on the course. |
| `ASSIGNMENT_ALREADY_EXISTS` | 409 | One assignment per target per course. Two would disagree about the deadline and only one would be read. |
| `ASSIGNMENT_ALREADY_WITHDRAWN` | 409 | Withdrawal deactivates the row rather than deleting it, so withdrawing twice is a distinguishable no-op rather than a missing record. |
| `COURSE_NOT_OPEN_FOR_SELF_ENROLLMENT` | 403 | Self-enrolment needs an `OPTIONAL` assignment covering the caller. A `REQUIRED` one already enrolled them. |
| `COURSE_NOT_ASSIGNED` | 403 | |
| `COURSE_NOT_IN_CATALOGUE` | 404 | Not listed, not published, or not for the caller's audience. One code for the three: telling them apart would confirm to somebody outside the audience that the course exists. |
| `ACCESS_REQUEST_ALREADY_PENDING` | 409 | One open request per person per course (`accessrequest_one_pending_per_course`). |
| `ACCESS_REQUEST_NOT_NEEDED` | 409 | The caller is already enrolled on the course, or already offered it: there is nothing to ask for. |
| `ACCESS_REQUEST_NOT_PENDING` | 409 | Deciding or withdrawing a request that has already been decided or withdrawn. |
| `ACCESS_REQUEST_DECIDER_NOT_BIOEKSEN` | 403 | Only Bioeksen decides, and only Bioeksen reads the queue or who answers for a distributor. Holding `academy.access_request.decide` is not enough; the caller must also be a member of Bioeksen or one of its departments. |
| `ACCESS_REQUEST_SELF_DECISION` | 403 | Nobody decides their own request, whatever they hold. |
| `RESPONSIBILITY_ALREADY_EXISTS` | 409 | That person already answers for that distributor. |
| `RESPONSIBILITY_NOT_BIOEKSEN_STAFF` | 409 | Only a member of Bioeksen who holds `academy.access_request.decide` can be made responsible for a distributor: they are sent the requests, with the requesters' details. |
| `ASSESSMENT_MAX_ATTEMPTS_REACHED` | 409 | |
| `ASSESSMENT_RETRY_DELAY_ACTIVE` | 409 | When the next attempt becomes available is in the `Retry-After` header, where HTTP already puts it. |
| `ASSESSMENT_REMEDIATION_REQUIRED` | 409 | What to repeat is on the assessment the caller just tried to attempt; the code says only that something must be. |
| `ASSESSMENT_TIME_LIMIT_EXCEEDED` | 409 | The attempt was submitted after `time_limit_minutes` from `started_at`, plus a ten-second grace for the request to arrive. The attempt is **closed and scored zero** as well as refused: leaving it open would let somebody sit past the limit, be refused, and resume — an unlimited exam reached by ignoring the limit once. |
| `ASSESSMENT_ATTEMPT_ALREADY_SUBMITTED` | 409 | |
| `ACTIVITY_BLOCK_NOT_SCOREABLE` | 400 | |

## Certificates

| Code | HTTP | Meaning |
|---|---|---|
| `CERTIFICATE_NOT_ENABLED_FOR_COURSE` | 409 | |
| `CERTIFICATE_COMPLETION_REQUIREMENTS_UNMET` | 409 | What is outstanding is on `GET /certificates/progress/{version}`, which the caller can read and which says the same thing whether or not anyone tried to issue. |
| `CERTIFICATE_ALREADY_ISSUED` | 409 | |
| `CERTIFICATE_ALREADY_REVOKED` | 409 | |
| `CERTIFICATE_REVOCATION_REASON_REQUIRED` | 400 | |
| `CERTIFICATE_VERIFICATION_NOT_FOUND` | 404 | Public verification endpoint. Reveals nothing beyond existence. |

## Organizations and identity

| Code | HTTP | Meaning |
|---|---|---|
| `ORGANIZATION_TYPE_NOT_PERMITTED` | 409 | A type refused where another is required — a customer organization used where `INTERNAL` is required, or a distributor asked to stop being one while it still has live relationships. `organizationsInScope` only follows a relationship out of a `DISTRIBUTOR`, so that second change would silently strip a manager's reach into every customer it named. |
| `ORGANIZATION_RELATIONSHIP_INVALID` | 400 | Self-relationship or unsupported type: only a `DISTRIBUTOR` may distribute to a customer, and never to itself. The relationship widens which organizations a scoped permission reaches, so its shape is enforced rather than assumed. |
| `ORGANIZATION_RELATIONSHIP_EXISTS` | 409 | |
| `MEMBERSHIP_ALREADY_EXISTS` | 409 | |
| `USER_EMAIL_ALREADY_EXISTS` | 409 | |
| `ROLE_ASSIGNMENT_OUT_OF_SCOPE` | 403 | Caller may not assign this role in this organization. |
| `ROLE_NOT_MEANINGFUL_HERE` | 409 | The role does not exist at that kind of organization — a Content Author at a customer, an IFU Manager at a distributor, a Platform Administrator anywhere organization-scoped. Distinct from `ROLE_ASSIGNMENT_NOT_PERMITTED`, which is about the caller's authority: this one refuses the combination no matter who asks, because the grant would confer nothing and say otherwise. |
| `ROLE_SELF_ASSIGNMENT_REFUSED` | 403 | Nobody grants themselves a role, Platform Administrator included. `iam.role.assign` is the permission that manufactures the others, and a self-grant is the one use of it with no second person in it — so it is also the one that turns a scoped, revocable grant into a direct one that outlives the grant it came from. Revocation is not restricted: giving up a role needs no separation of duties. |
| `ASSIGNMENT_TARGET_OUT_OF_SCOPE` | 403 | The person or organization a course is being assigned to, or the assignment being withdrawn, is outside the caller's scope for `academy.assignment.manage`. The target is in the body rather than the path, so the guard cannot check it and the handler must. |
| `SELF_REGISTRATION_DISABLED` | 403 | Public Academy registration is out of scope by design. |
