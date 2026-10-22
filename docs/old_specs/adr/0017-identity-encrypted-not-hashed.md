# ADR-0017: e-IFU access identities are encrypted, not hashed

- **Status:** Accepted for implementation — legal review pending
- **Date:** 2026-09-07
- **Extends:** ADR-0016, which retains these identifiers indefinitely. This
  record is the condition that makes that defensible.
- **Business owner:** Bioeksen project ownership — decided the position
- **Legal owner:** Bioeksen legal function — owns lawfulness of collection and period
- **Technical owner:** Engineering
- **Formal legal review:** pending — see *Outstanding legal questions*

## Context

Three answers from project ownership on 2026-09-06 and 2026-09-07 set this up,
and the third one corrected the first two into something coherent:

1. The lawful basis is **both** explicit consent — the notice checkbox on the
   e-IFU form — **and** an IVDR traceability requirement.
2. **Accessor identity is required.** A regulator may ask who received which IFU
   revision, and a field safety notice needs an address to write to.
3. The identity should be kept, "hashed at intervals, and reachable only in
   certain ways".

Answers 2 and 3 as first stated do not fit together, and the mismatch is
technical rather than a difference of opinion:

- **A hash of an email address is not a protected address.** An email is not a
  secret with entropy; it is a name from a small space. Anybody holding a table
  of digests and a list of plausible addresses recovers them in one pass, with
  no key to break. `test/identity-encryption.spec.ts` demonstrates this rather
  than asserting it.
- **A hash is one-way**, so it cannot answer "to whom" — the obligation answer 2
  says exists.

What answer 3 actually asks for is that the identity survive, not be readable by
anybody who can read the database, be reachable only through a controlled path,
and become less reachable over time. That is encryption with a rotating key, and
it satisfies answers 1 and 2 as well.

## Decision

The identifying columns of `EifuAccessRecord` — `email`, `first_name`,
`last_name`, `ip_address` — are **encrypted at rest**.

1. **AES-256-GCM**, keyed by a ring in `EIFU_IDENTITY_KEYS`: `id:base64key`
   entries, newest first. Writes use the first; reads follow the `identity_key_id`
   stored on the row. Rotation is therefore a configuration change and never a
   migration.
2. **Retiring a key is the retention mechanism.** Dropping it from the ring
   makes those rows unreadable by anybody, us included. That is a stronger and
   more verifiable guarantee than a deletion, and it is what "less reachable
   over time" means in practice. The scheduler re-encrypts rows onto the current
   key so a key can be emptied before it is retired.
3. **One audited read path.** `POST /api/v1/privacy/access-records/:id/identity`,
   behind `eifu.access_record.view_raw`, requiring a reason, writing an
   `AuditEvent` **before** the read so that an attempt that fails is recorded
   too. Retaining an identity indefinitely is defensible because reaching it
   leaves a trace; an unaudited decrypt would remove the argument.
4. **A keyed lookup index**, `email_hash` = HMAC-SHA-256 of the lower-cased
   address under a separate pepper. It exists only so an erasure request can
   find a person's rows without decrypting the table. Keyed, because a bare
   digest here would reintroduce exactly the attack encryption prevents.
5. **The pepper never rotates.** Rotating it orphans every existing hash, and
   the first symptom is an erasure request that silently finds nothing.
6. Erasure clears the ciphertext, the lookup index and the key id together.
   `eifuaccess_anonymised_keeps_no_handle` refuses the row otherwise: a
   surviving hash would still answer "was this person here?".
7. **Production refuses to start without a key ring**, and with a pepper under
   32 characters.

## Consequences

### Positive

- ADR-0016's indefinite retention gains the condition that makes it arguable:
  the data is retained, and reading it is an audited act rather than a `SELECT`.
- Both stated obligations are met at once. "To whom" is answerable, and a field
  safety notice has an address to reach.
- Consent withdrawal and the IVDR obligation stop being in direct conflict. A
  withdrawal is honoured by erasure; the *access event* — which product, which
  LOT, which revision, when — survives it and is what traceability actually
  rests on.
- A database backup that leaks is not a leak of the identities, provided the
  key ring is not stored beside it. **That proviso is the whole value of this
  record** and belongs in the deployment runbook.

### Negative / accepted costs

- Key management is now a production responsibility. A lost key is lost data,
  and there is no recovery — which is the same property that makes retiring a
  key a real erasure.
- The identifying columns can no longer be searched or sorted in SQL. Nothing
  did; if something needs to, it goes through the lookup index or it does not
  happen.
- Rows written before this was configured hold plaintext with a NULL key id.
  The scheduler brings them under a key; until it has, they are readable.
- Encryption at rest protects against reading the database. It does not protect
  against an application that decrypts on request — which is why item 3 is a
  permission and an audit event rather than a convenience.

### Outstanding legal questions

Carried from ADR-0016, with the answers received on 2026-09-07 folded in:

- [x] Lawful basis — **explicit consent and IVDR traceability, both.**
      Recorded by project ownership. Open question below on what "both" means
      when they diverge.
- [x] Whether accessor identity is required for traceability — **yes.**
- [x] Whether anonymisation satisfies erasure — **yes**, and the access event
      survives it.
- [ ] **New.** Consent is withdrawable and a legal obligation is not. When
      somebody withdraws consent, today the erasure is honoured in full. If the
      IVDR obligation is the operative basis for that record, an erasure may
      have to be refused instead — and there is no refusal path in the code.
      This is the one place the two bases genuinely diverge.
- [ ] **New.** How long the IVDR obligation runs. It is what determines when a
      key may be retired, and retiring one is irreversible.
- [ ] Where the key ring lives in production, and who can read it. Encryption
      at rest is worth exactly as much as the separation between the key and
      the backup.
- [ ] Notice text and its versioning (`privacy-data-residency.md`) — does it
      say that both bases apply, and what withdrawal does?

**These do not block implementation.** They block the claim that the posture is
compliant, and they must be resolved before production release.

## Alternatives considered

- **Hash the address.** The first proposal. Rejected on the two technical
  grounds above, both demonstrated in the test suite rather than argued.
- **Pseudonymise by replacing the address with an opaque id and keeping the
  mapping in a second table.** Equivalent in effect and worse in practice: the
  mapping table is then the thing to protect, and it has none of the properties
  — no rotation, no per-row key, no authenticated ciphertext — that make the
  envelope approach auditable.
- **Store nothing and rely on the anonymised event.** Rejected by answer 2: a
  regulator may ask who received a revision, and an event that names nobody
  cannot answer.
- **Encrypt the whole database rather than these columns.** Full-disk or
  cluster-level encryption protects a stolen disk and nothing else — every
  application query still returns plaintext. It is complementary and is not a
  substitute.
