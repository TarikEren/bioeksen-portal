# Stage B1: Identity and platform services (crisis mode)

This is the contract of stage B1, step 1 of the loop of `crisis_mode.md`
(DEC-136). It names what the agents build. It writes no test. The plan of B0
is in git: `git show c3de89c:docs/plans/test_plan.md`.

**Status.** The owner approved this contract on 2026-10-22.

**Items.** FND-04 (AC5), FND-07 (AC3), FND-08 (AC5), PLT-40, PLT-20, ACC-10
(with ACC-11), ACC-20, ACC-30 (AC1, AC3, AC4; with ACC-31), ACC-40, PLT-10,
PLT-30, ACC-50 (AC1, AC2).

**Exit flow** (README › *Build order*). On the demo: bootstrap creates the
first Platform Administrator and sends the invitation. The administrator sets
a password from the mail in Mailpit, signs in, creates a second user, and
grants the IFU Manager role. Each grant has its `platform_audit_record` row.

**Rules in force that are Pending.** DEC-013, DEC-021 (SDS), DEC-135 (IT).

## API

All paths are under `/api/v1/identity/`. Bodies and lists follow
`sds-api-design` (camelCase, ids as strings, `status: "ok"`, 201 with
`Location`, the list body). Each answer carries `X-Request-Id` and
`Cache-Control: no-store`. "Session" means the cookie `bp_session`. A route
that changes state and reads the session checks `Origin` (FND-07.AC3:
401 `AUTH-4101`). Each session route answers 401 `AUTH-4100` without a
session, and 403 `PERM-4150` without the permission (ACC-30).

| Method and path | Caller | Body or query | Success | Failures |
|---|---|---|---|---|
| `POST sign-in` | anyone | `{ email, password }` | 200 `{ user: Me }`, sets `bp_session` (ACC-20.AC1) | 401 `AUTH-4101`, one body for the three cases (AC2); 429 `RATE-4400` with `Retry-After` (AC3–AC5, DEC-027) |
| `POST sign-out` | session | — | 200, ends the session, clears the cookie | 401 `AUTH-4100` |
| `GET me` | session | — | 200 `{ user: Me }` | 401 `AUTH-4100` |
| `GET users` | `organization.users.view` | `page`, `limit`, `q` | 200 list of `UserSummary` | — |
| `POST users` | `organization.users.manage` | `CreateUserInput` | 201 `{ user: UserDetail }`; one invitation mail after commit (ACC-10.AC1) | 409 `RES-4300` (AC2) |
| `GET users/{id}` | `organization.users.view` | — | 200 `{ user: UserDetail }` with its active roles | 404 `RES-4200` |
| `POST users/{id}/invitation` | `organization.users.manage` | — | 200; the earlier link ends (AC6) | 404; 409 `RES-4302` when the user already has a password |
| `POST users/{id}/deactivation` | `organization.users.manage` | — | 200; each session of the user ends (AC7) | 403 `PERM-4150` for oneself (AC8); 409 `RES-4302` when inactive |
| `POST invitations/accept` | anyone | `{ token, password }` | 200 (AC3) | 401 `AUTH-4101` used or ended; 401 `AUTH-4102` older than 14 days (AC4); 400 `VAL-4006` with each broken rule in `details` (AC5) |
| `POST password-resets` | anyone | `{ email }` | 202, the same body always; a mail only to an active user (ACC-11.AC1) | 400 `VAL-4001` |
| `POST password-resets/complete` | anyone | `{ token, password }` | 200; every other session ends (ACC-11.AC2) | 401 `AUTH-4102` (AC3); 401 `AUTH-4101` (AC4); 400 `VAL-4006`, also for the current password (AC5) |
| `GET roles` | `iam.role.manage` | — | 200 `{ roles: RoleView[] }` | — |
| `POST users/{id}/role-assignments` | `iam.role.manage` | `{ roleCode }` | 201; one audit row (ACC-31.AC1) | 403 `PERM-4150` for oneself (AC2) or without `iam.role.manage` (AC5); 409 `RES-4300` held already (AC3); 409 `RES-4302` inactive user |
| `POST users/{id}/role-assignments/{roleCode}/revocation` | `iam.role.manage` | — | 200; `isActive` false; one audit row (ACC-31.AC4) | 404 `RES-4200` no active assignment |

The operator endpoints of B0 gain the rate limit of FND-04 rule 4 and AC5.
`setLanguage` (B0) also stores nothing for a user; FND-08.AC5 comes from the
user's `preferredLanguage`.

**Test seams** (the backend step adds them for the test phase; seams only):
`POST /api/test/session { userId }` (a test sign-in), `POST /api/test/clock
{ now }`, `GET /api/test/mail?to=` and `POST /api/test/mail/mode { mode }`
(`ok`, `refuse`, `down`, `timeout`), `POST /api/test/files` (PLT-10).

## Data

One migration `identity_and_audit` (`prisma migration plan`, never
`db update`). The DELETE and TRUNCATE triggers call `platform_refuse_delete()`
(B0) as `rawSql` in the same migration.

| Table | Columns and constraints |
|---|---|
| `identity_user` | `id` BIGSERIAL; `email`; `email_normalized` (lower case), unique `identity_user_email_unique`; `first_name`; `last_name`; `preferred_language` check `tr`/`en`; `is_active` (default true); `password_hash` (null until set); `password_changed_at`; `created_at`, `updated_at` timestamptz(3). Refuses DELETE and TRUNCATE (DEC-010) |
| `identity_auth_token` | `id`; `user_id` → `identity_user`; `purpose` check `INVITATION`/`PASSWORD_RESET`; `token_hash` (SHA-256), unique; `expires_at`; `used_at`; `ended_at`; `created_by_user_id` (null for bootstrap); `created_at`; partial unique (`user_id`, `purpose`) where `used_at` and `ended_at` are null |
| `identity_permission` | `id`; `code` unique |
| `identity_role` | `id`; `code` unique; `name` JSONB `{tr, en}` with its check (DEC-011) |
| `identity_role_permission` | `role_id`, `permission_id`; unique pair |
| `identity_role_assignment` | `id`; `user_id`; `role_id`; `is_active`; `granted_by_user_id` (null for bootstrap); `granted_at`; `revoked_by_user_id`; `revoked_at`; partial unique (`user_id`, `role_id`) where `is_active`. Refuses DELETE and TRUNCATE |
| `platform_audit_record` | `id`; `occurred_at`; `actor_type` check `USER`/`SYSTEM`; `actor_user_id`; `action_code` (`<module>.<entity>.<verb>`); `entity_type`; `entity_id`; `state_before`, `state_after` JSONB; `reason`; `request_id`. Refuses UPDATE, DELETE and TRUNCATE |

Audited actions: `identity.user.created`, `identity.user.invited`,
`identity.user.deactivated`, `identity.role_assignment.granted`,
`identity.role_assignment.revoked`. The audit row and its `AUDIT` log record
are in the transaction of the change (DEC-014, PLT-40). A creation writes
`identity.user.created` only; a re-invitation writes `identity.user.invited`
(ACC-10 rule 6, owner answer 2026-10-22).

Role codes (ACC-30 rule 4, owner answer 2026-10-22): `IFU_MANAGER` and
`PLATFORM_ADMINISTRATOR`.

**Redis.** Sessions: key from the SHA-256 of the session id, with `userId`,
`createdAt`, `lastSeenAt`; a set of sessions for each user; 60 minutes idle
and 12 hours in total (DEC-025). Rate limits: failed sign-ins by source
(10 in a minute) and by email address (5 in a row, then 15 minutes), failed
operator authentications by source (10 in a minute). The clock is `now()`
(`src/lib`), so the test seam can move it.

## Services and types

Types and zod schemas: `src/lib/schemas/identity.ts` (`SignInInput`,
`CreateUserInput`, `SetPasswordInput`, `UserListQuery`, `Me`, `UserSummary`,
`UserDetail`, `RoleView`, `RoleAssignmentView`, `PermissionCode`). The
registry of ACC-30 (permissions and the two roles) is one constant:
`src/modules/identity/domain/registry.ts`.

| Service file | Functions |
|---|---|
| `src/modules/identity/services/session-service.ts` | `signIn(input, meta)`, `signOut(sessionId)`, `getSessionUser(sessionId)` |
| `src/modules/identity/services/user-service.ts` | `listUsers(actor, query)`, `createUser(actor, input)`, `getUser(actor, id)`, `reinviteUser(actor, id)`, `deactivateUser(actor, id)` |
| `src/modules/identity/services/credential-service.ts` | `acceptInvitation(input)`, `requestPasswordReset(email)`, `completePasswordReset(input)` |
| `src/modules/identity/services/role-service.ts` | `listRoles(actor)`, `grantRole(actor, userId, roleCode)`, `revokeRole(actor, userId, roleCode)` |
| `src/modules/platform/services/audit-service.ts` | `appendAudit(tx, entry)` |
| `src/modules/platform/services/mail-service.ts` | `queueMail(tx, message)` sent after commit; the invitation and reset templates in both languages |
| `src/modules/platform/services/file-service.ts` | `storeDocumentFile(ids, bytes)`, `signedDownloadUrl(key)` (PLT-10; no page uses them in B1) |
| `src/worker/main.ts`, `src/worker/bootstrap.ts` | the hourly pass with an advisory lock (PLT-30; no job yet); `pnpm run bootstrap` (ACC-40) |

`actor` is the session principal: the user id and the set of permission
codes. Each service checks its permission (`sds-nextjs-backend` §1).

**Mock data** (step 2): `src/lib/mock/identity.ts`: three users (a Platform
Administrator, an IFU Manager, an inactive user), the two roles, and a mock
session store. Each mock sign-in accepts the password
`mock-password-1234`. Each mock function carries `// MOCK: <item>`.

## UI

The text comes from the dictionaries, in the groups `signIn`, `invitation`,
`passwordReset`, `backoffice`, `users`, `roles`, `noArea`, and
`common.signOut`. The failure text follows DEC-122 (by code).

| Page | Path | Content |
|---|---|---|
| Sign-in | `/sign-in` | Email, password, submit, the link to the reset request. After sign-in: `/backoffice` when the user holds a permission (ACC-50.AC1), else `/no-area` (AC2) |
| Set a password | `/invitation` (token in the fragment `#token=`) | Password, submit, the broken rules (ACC-10.AC5) |
| Request a reset | `/password-reset` | Email, submit, the same message always |
| Set a new password | `/password-reset/complete` (token in the fragment) | Password, submit |
| Backoffice shell | `/backoffice/**` | Navigation (Users with `organization.users.view`), the user menu with sign-out, the language switch. Without a session, the proxy and the layout send the person to `/sign-in` (ACC-30.AC1) |
| Start page | `/backoffice` | The name of the user and the areas that the permissions open |
| Users | `/backoffice/users` | The list; "new user" with `organization.users.manage` |
| New user | `/backoffice/users/new` | Email, first name, last name, preferred language |
| User | `/backoffice/users/[id]` | The details; re-invite and deactivate (`organization.users.manage`); the roles with grant and revoke (`iam.role.manage`) |
| No area | `/no-area` | "The account has no area yet", and sign-out (ACC-50.AC2) |
| Entry page | `/` | Adds a link to the sign-in |

The language of a signed-in user is the user's `preferredLanguage`
(FND-08.AC5, DEC-017).

## Tasks

| Step | Who | Done when |
|---|---|---|
| 2 Mock skeleton | Backend agent | The schemas, the registry, every service of the table on mocks, the routes of the API on the services, the session principal in the route wrapper, the proxy redirect for `/backoffice` |
| 3 Frontend | Frontend agent | Each page of the UI table works on the mocks, in Turkish and English |
| 4 Backend | Backend agent | The migration, the repositories and the real services, in the B1 order (audit and mail first). Sessions and rate limits in Redis, FND-04.AC5, FND-07.AC3, FND-08.AC5. Mail by SMTP (Mailpit in the demo, with STARTTLS: see *The demo relay*), files in MinIO, the worker, bootstrap. `compose.demo.yaml` runs bootstrap after the migrations, and runs the worker. Each `MOCK:` goes. New packages: `nodemailer`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| 5 Phase review | `code-reviewer` | The commits of B1, against the items above |
| 6 Fix | Developers | Critical and Major findings fixed |
| 7 Stage check | Main session | The gate of `crisis_mode.md` §5, with the exit flow in the demo |

**Carried from step 2 to step 4** (step 2 is `34f0fbe`). The Origin check
(FND-07.AC3), the rate limits and 429 `RATE-4400`, and the test seams. A
`SECURITY` log record for each granted session request, as the operator path
writes one. The bundled list of DEC-137 replaces the mock list of
`common-passwords.ts`. A re-invitation of an inactive user gives 409
`RES-4302` (DEC-013).

**Choices the specs left open.** The owner accepted them on 2026-10-22, and
they are Default decisions now: DEC-129 (`scrypt` hashes), DEC-137 (the
bundled common-password list, entries of 15 characters or more) and DEC-138
(the token in the URL fragment).

**The demo relay** (owner answer 2026-10-22). DEC-135 applies each rule of
`production` to the demo, so PLT-20.AC3 applies there too: the app sends
nothing to a relay that offers no STARTTLS. In `compose.demo.yaml`, a one-shot
service makes a self-signed certificate for the host `mailpit` in a shared
volume. Mailpit offers STARTTLS with this certificate. The app, the worker and
bootstrap trust it through `NODE_EXTRA_CA_CERTS`. No setting of the app
changes, and no check of TLS is switched off.
