# Stage B4: Public lookup (crisis mode)

This is the contract of stage B4, step 1 of the loop of `crisis_mode.md`
(DEC-136). It names what the agents build. It writes no test. The contract of
B3 is in git: `git show feature/b3-documents:docs/plans/test_plan.md`. After
B4, the test phase of B0 to B4 starts (`crisis_mode.md` §6).

**Status.** The owner approved this contract on 2026-10-22.

**Items** (README › *The B4 order*). IFU-90 first, then IFU-50 (with IFU-51),
IFU-60 (with IFU-61, IFU-62), IFU-80 and IFU-70. With them: FND-05 (AC4),
FND-06 (AC3, AC4, AC5), FND-09 (AC1, AC4), ACC-50 (AC3).

**Exit flow** (README › *Build order*). On the demo, a visitor with no account
opens `/eifu`, enters a catalog number, a LOT number and an email address,
gives consent, gets the six-digit code by mail (Mailpit), enters it, and gets
the files of the correct version. The lookups of the fixture of IFU-60 give
their outcomes. Each lookup has its access record, which holds the encrypted
identity.

**Rules in force that are Pending.** DEC-013, DEC-039, DEC-073 (SDS); DEC-060,
DEC-067 (QA); DEC-068, DEC-075 (PO); DEC-074 (LEG); DEC-083, DEC-132, DEC-135
(IT). The build follows the rule in each row.

**The UI reference.** The mockup `BioeksenPortal/frontend`,
`src/features/eifu/` (`EifuLookupPage`, `ConsentNotice`, `LookupAlert`,
`ResolutionPanel`). The specs win on a conflict (for example DEC-019: no
success banner and no success color).

## API

All paths are under `/api/v1/eifu/`. The three routes need no session (DEC-070)
and change no catalog or document row. Bodies follow `sds-api-design` and B1 to
B3; an unknown field is 400 `VAL-4007`. The rate limits of DEC-072 are in Redis
(DEC-007), by the email address and by the source address of DEC-038, and a
limited request gets 429 `RATE-4400` with `Retry-After`.

| Method and path | Body | Success | Failures |
|---|---|---|---|
| `POST verifications` | `catalogNumber`, `lotNumber`, `email`, `noticeVersion`, `noticeAccepted` | 201 with `Location`, `{ id, expiresAt }` (id a UUID, DEC-121; 10 minutes, DEC-071); one code mail; the same answer whether or not the catalog number or the LOT exists (IFU-50.AC1–AC3) | 400 `VAL-4006` on `noticeAccepted` or `noticeVersion` (AC4, AC5); 400 `VAL-4001` (AC6); 429 `RATE-4400` (AC7–AC9); 503 `UP-5500`, `UP-5501`, 500 `UP-5000` when the code mail fails (AC10) |
| `GET verifications/{id}` | — | 200 `{ id, expiresAt, attemptsRemaining }` (AC12) | 404 `RES-4200` |
| `POST lookups` | `verificationId`, `code` | 200 `{ status: "ok", outcome, catalogNumber, lotNumber, manufacturingDate?, productName?, documentNumber?, documentTitle?, revision?, resolvedViaOverride?, files? }` (IFU-60 rule 4, DEC-073); each file `{ languageCode, contentType, fileSizeBytes, fileHash, downloadUrl }`, sorted by the language code (DEC-069) | 400 `VAL-4006` on `code` (IFU-51.AC3) or `verificationId` (AC6); 409 `RES-4302` used, ended after the fifth wrong code, expired, or the mail failed (AC2, AC4, AC5, AC7, AC8); 400 `VAL-4007` (AC9); 429 `RATE-4400` (AC10); 500 `DB-5001` when the access record cannot be written, with no link (IFU-80.AC6) |

The resolution follows IFU-60 rule 2, step by step, with a limit of 2 rows on
the periods. It never sorts by a revision label, a version, a date or an id,
and it never falls back to another version.

## Data

One migration `eifu_lookup` (`prisma migration plan`, never `db update`).

| Table | Columns and constraints |
|---|---|
| `eifu_verification` | The columns of IFU-50 *Data*: `public_id` UUID unique; the inputs as typed; `notice_version`; `email` and `client_address` encrypted (bytea), `email_lookup_hash`, `identity_key_id`; `user_agent` (≤ 512); `code_hash` (a keyed hash, DEC-071); `attempts_used`; `expires_at`, `used_at`, `ended_at`, `send_failed_at`. Not a controlled record: the worker removes it 24 hours after it ends (IFU-50 rule 6, AC13) |
| `eifu_access_record` | The columns of IFU-80 *Data*; `resolved_product_id` and `resolved_document_version_id` with no foreign key (IFU-80 rule 2); the index on `(created_at, anonymized_at)`; the check `access_record_anonymized_keeps_no_identity` (IFU-81.AC6, ready for B5). A controlled record: the DELETE and TRUNCATE triggers with `platform_refuse_delete()` as `rawSql` (DEC-010) |

**FND-06.AC3 to AC5.** Each named constraint and trigger of `catalog.md` and
`eifu.md` exists after the migrations apply to an empty database, and each
controlled table refuses DELETE and TRUNCATE. The stage check verifies this
with SQL on the demo database.

## Identity protection (IFU-90, first)

- `src/modules/eifu/domain/identity.ts`: `encryptIdentity(value)` with
  AES-256-GCM and the first key of `EIFU_IDENTITY_KEYS` (a random nonce; the row
  keeps the key id); `decryptIdentity(cipher, keyId)`; `lookupHash(email)` =
  HMAC-SHA-256 of the lower-case email address with
  `EIFU_IDENTITY_LOOKUP_PEPPER`. Only the eifu services call it.
- The worker gets its first two jobs (PLT-30): the removal of the verifications
  that ended more than 24 hours before (IFU-50 rule 6), and the move of at most
  500 rows that name an older key to the first key (IFU-90 rule 6). Each job
  logs `JOB` records; a failed job does not stop the other one (PLT-30.AC2).
- FND-05.AC4: no log record of a verification holds the email address, the code
  or the full client address (an IPv4 address keeps its first three octets, an
  IPv6 address its first 48 bits).

## Services and types

Types and zod schemas: `src/lib/schemas/lookup.ts` (`VerificationInput`,
`VerificationView`, `LookupInput`, `LookupAnswer`, `LookupFile`, `Outcome` with
the nine outcomes of IFU-60 and IFU-62).

| File | Functions |
|---|---|
| `src/modules/eifu/services/verification-service.ts` | `createVerification(input, meta)`: the limits, the row, the code mail after the commit and awaited, `send_failed_at` on a failure; `getVerification(publicId)` |
| `src/modules/eifu/services/lookup-service.ts` | `lookup(input, meta)`: the code check (five tries), the verification used and the access record in one transaction (IFU-51.AC8: exactly one of two concurrent lookups), the resolution of IFU-60, then the signed URLs of DEC-076 after the commit |
| `src/modules/eifu/domain/resolution.ts` | the steps of IFU-60 rule 2 over the reads it is given |
| `src/modules/platform/services/mail-service.ts` | a code mail in Turkish and English in one body, with the code, the catalog number and the LOT number, and no link (PLT-20 rule 2, IFU-50.AC2), sent so that the caller gets its result |

The lookup reads the catalog through the catalog services, and the documents
through the eifu repositories (DEC-004).

**Mock data** (step 2): `src/lib/mock/lookup.ts`: a verification store, the
code `123456` for each mock verification, and the fixture of IFU-60 as answers
(the LOTs of 2024-06-15, 2026-03-09 and 2023-01-01, one unknown catalog number,
one unknown LOT, one LOT of another catalog number, one LOT with a date
conflict). Each mock function carries `// MOCK: <item>`.

## UI

| Page | Path | Content |
|---|---|---|
| Lookup | `/eifu` | One page, three states (IFU-70): the verification step (catalog number, LOT number, email address, the full consent text with its version and a draft marker, the consent box not ticked); the code step (six digits, the attempts that remain after a wrong code); the result (catalog number, LOT number, manufacturing date, document number, revision label, one download link for each language, whose accessible name holds the document type, the language name and the word PDF). Each outcome other than `RESOLVED` and each failure has its own text with its code (DEC-122). No success banner and no success color (DEC-019). The header has the language choice. The answer carries `X-Robots-Tag: noindex` (AC9). Keyboard only works for both steps (AC10) |
| Entry page | `/` | Offers the public lookup and the sign-in (ACC-50.AC3) |

The text comes from the dictionaries, in the group `lookup`. Identifiers and
dates are in IBM Plex Mono (DEC-016), on one line. The page loads nothing from
another host (FND-09.AC1). FND-09.AC4 (axe-core on `/eifu`, the sign-in page and
the backoffice start page) is a test of the test phase; the build follows
DEC-018.

## Tasks

| Step | Who | Done when |
|---|---|---|
| 2 Mock skeleton | Backend agent | The schemas, the services on mocks, the three routes, the identity functions (real) |
| 3 Frontend | Frontend agent | `/eifu` and the link on `/` work on the mocks, in Turkish and English, after the mockup |
| 4 Backend | Backend agent | The migration, the repositories, the real services, the code mail, the two worker jobs, the log redaction. Each `MOCK:` goes |
| 5 Phase review | `code-reviewer` | The commits of B4, against the items above |
| 6 Fix | Developers | Only a finding that blocks the test phase, unless the owner calls for more |
| 7 Stage check | Main session | The gate of `crisis_mode.md` §5, with the exit flow and the fixture of IFU-60 in the demo; the SQL checks of FND-06.AC3 to AC5 |

**Carried from step 2 to step 4** (step 2 is `46ddf63`, `d42ffd5`, `ea85b5f`).
- The real reads of `ResolutionReads`: the catalog number, the LOT, the LOT
  under another catalog number, the active override and its target, the
  periods with a limit of 2, the active files.
- `cleanTransport` reaches eifu from `src/modules/catalog/domain/lot-number.ts`
  directly; step 4 gives it to eifu through a catalog service or a shared helper
  (DEC-004).
- The migration `eifu_lookup`, the encrypted columns, the limits of DEC-072 in
  Redis, the code mail (Turkish and English, no link) awaited after the commit,
  the one transaction of the lookup with 500 `DB-5001`, the signed URLs after
  the commit, the two worker jobs, and the truncation of a client address in a
  log record (DEC-139).

**Filled by step 2.** The page calls three server actions
(`createVerificationAction`, `getVerificationAction`, `lookupAction`); the routes
stay the HTTP contract, and both call the same services. A success body is flat
(`{ status, id, expiresAt }`). `LookupAnswer` is a union narrowed on `outcome`.
`productName` and `documentTitle` are in the language of the request. A code
that is not six digits counts as a wrong code (IFU-51.AC3). The checks of
`noticeAccepted` and `noticeVersion` are in the service, so that they give
`VAL-4006` (IFU-50.AC4, AC5). The code hash is HMAC-SHA-256 of
`verificationId:code` with a key derived from the pepper by a fixed label; the
key id is the additional data of AES-GCM. The issue phrases are one `as const`
set, `LOOKUP_ISSUES`.

**Choices the specs left open.** The owner accepted them on 2026-10-22. They
are Default decisions now: DEC-097 (the flow of the verification and the
lookup: the awaited code mail, the one transaction of the lookup, the read of
`attemptsRemaining`), DEC-098 (the draft consent text of the mockup) and
DEC-139 (the part of a client address in a log record). The check
`access_record_anonymized_keeps_no_identity` of IFU-81.AC6 comes with the table
now; it needs no decision.

## Stage check (2026-10-22)

The gate of `crisis_mode.md` §5 at `0e979be`:

- `pnpm run typecheck`, `pnpm run lint` and `pnpm run build` pass (the build
  ran in the image of the demo).
- `pnpm run test`: 299 passed, 4 failed; the 4 are the FND-09.AC2 contrast
  tests (RC-1).
- No `MOCK:` comment remains in `src/`.
- The demo starts from `compose.demo.yaml`, and the migration `eifu_lookup`
  applies there. The exit flow passed in the browser: a visitor with no session
  proved an email address with the mailed code and got the files of the correct
  version; a second lookup gave `LOT_CATALOG_MISMATCH`; each lookup has its
  access record with the encrypted identity. `/eifu` has
  `X-Robots-Tag: noindex` and loads nothing from another host. The SQL checks
  of FND-06.AC3 to AC5 pass on the demo database. Screenshots:
  `docs/plans/b4-exit/`.
- Review 7 is recorded. R-095, R-096 and R-097 are Major, and the reviewer says
  that R-095 blocks the test phase. Each finding waits for the call of the owner
  (§4 step 6).

**Result:** B4 passes each check of the gate except one: an open finding
(R-095) may block the test phase. The owner decides before the test phase
starts.
