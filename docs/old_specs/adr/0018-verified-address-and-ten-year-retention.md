# ADR-0018: The address is proved before the document, and kept for ten years

- **Status:** Accepted for implementation — legal review pending
- **Date:** 2026-09-07
- **Supersedes:** ADR-0016's indefinite retention. ADR-0017 (encryption at rest)
  stands unchanged and is still the condition this rests on.
- **Business owner:** Bioeksen project ownership — decided the position
- **Legal owner:** Bioeksen legal function — owns lawfulness of collection and period
- **Technical owner:** Engineering
- **Formal legal review:** pending — see *Outstanding legal questions*

## Context

Two things were true and did not sit together.

**The address was never proved.** The e-IFU form took an email address and
believed it. That was tolerable while nothing depended on it, and stopped being
tolerable in the space of two days: ADR-0016 made the address the key an erasure
request matches on, and the answer to "is accessor identity required for
traceability" was yes. An address typed in a hurry — `a@b.com` — produces a
record that names nobody, cannot support a field safety notice, and can never be
reached by the person it describes.

**Indefinite retention was the hardest posture to defend.** ADR-0007 said so and
ADR-0016 repeated it while choosing it anyway. It also left the consent text with
nothing to say: "we keep this until we decide otherwise" is not a period a person
can consent to.

Both were resolved by project ownership on 2026-09-07, and they resolve each
other: an address worth keeping for a decade is one worth proving, and a proved
address is one a bounded period can be honest about.

## Decision

**1. A one-time code, before the document.**

The lookup becomes two requests:

- `POST /api/v1/eifu/verification` — takes the catalog number, the LOT, the
  address and the consent, sends a six-digit code, and returns a
  `verification_id`. It says **nothing** about whether the catalog number or the
  LOT exists; answering that before the address is proved would be an
  enumeration endpoint with an email field attached, which is what the old
  resolution endpoint was.
- `POST /api/v1/eifu/resolve` — takes the `verification_id` and the code, and
  nothing else. The address, the catalog number and the LOT ride on the pending
  verification, so a code obtained for one lookup cannot be spent on another and
  the record of what was proved is the record of what was resolved.

The verification is consumed on use: one download, not a standing pass.

`EifuAccessRecord.email_verified` marks it. A column rather than an assumption,
because rows written before today were not proved and a ten-year traceability
record has to say which kind each row is.

**2. Ten years.**

`EIFU_ACCESS_RECORD_RETENTION_DAYS` defaults to 3650, and the scheduled
anonymisation pass — built and dormant since ADR-0016 — now runs. Erasure on
request stays for anybody who does not want to wait.

**3. A consent text that says all of this.**

Drafted, bilingual, in the locale files with the rest of the user-facing text,
and shown in full where consent is given rather than behind a link to elsewhere.
It states what is collected, both lawful bases, the ten years, the encryption,
the audited access, and how to ask for erasure. It announces that it is a draft,
for as long as that is true.

## Two documented rules this reverses

Recorded here rather than quietly edited, because both were deliberate:

- **`notifications.md`: "any e-IFU-triggered messaging" was explicitly out of
  scope**, and the e-IFU flow "**never** sends a message as a result of a
  lookup". It does now, for one message and one purpose. The exclusion existed
  to keep marketing out of a regulatory flow, and that part is unchanged: this
  is not a message about the product, it is the flow authenticating its own
  input.
- **`notifications.md` rule 4: an email never carries a token.** The
  verification code is a token. The rule's reasoning — that a message is not a
  secure channel and must not carry a key to anything — is why the code is
  short-lived, single-use, limited to five guesses and useless without the
  `verification_id` it was issued against. It carries no link, no signed URL and
  no document, so rule 4 stands for every payload except this one.

## Consequences

### Positive

- The identity on an access record is one somebody demonstrated. That is what
  makes the traceability claim worth anything, and what makes an erasure request
  reachable by the person making it.
- A bounded period is a far easier posture to defend under KVKK Art. 4 than
  indefinite retention, and it is a number the consent text can state.
- The resolution endpoint stops being an anonymous enumeration surface. Walking
  LOT numbers now costs an inbox per attempt.
- The dormant anonymisation pass built under ADR-0016 becomes live with a value
  change, which is what that record promised it would be.

### Negative / accepted costs

- **A mail server is now on the path to a regulatory document.** This is the
  cost `notifications.md` was avoiding, and it is real: an SMTP outage means
  nobody can obtain an IFU. Mitigated as far as engineering can — production
  refuses to start without a mail server, a send failure is reported as itself
  rather than as a generic error, and the endpoint is rate limited so it cannot
  be turned into a mail bomb — but not removed. **Operational monitoring of
  delivery is now a production requirement, not a nicety.**
- Two steps where there was one. A laboratory under time pressure now waits for
  a message. That is the trade being made deliberately: the previous flow was
  faster and recorded a name nobody had checked.
- Somebody without access to the address they typed cannot obtain the document.
  There is no bypass, and adding one would remove the point.
- Anonymisation at ten years is irreversible. Shortening the period later is
  safe to apply; lengthening it only affects records not yet cleared.

### Outstanding legal questions

- [ ] **The consent text is a draft.** It is shown to users, marked as a draft,
      and needs Bioeksen legal to write or approve the final wording. Its
      version is `EIFU_LEGAL_NOTICE_VERSION`; approving it means bumping that,
      which invalidates acknowledgements of the draft — deliberately, because an
      acknowledgement of superseded wording is evidence of the wrong thing.
- [ ] Whether ten years is right. It should be checked against the IVDR
      technical-documentation retention and against how long a field safety
      notice might need to reach somebody.
- [ ] Carried from ADR-0017: consent is withdrawable and a legal obligation is
      not. An erasure request is still honoured in full; if the IVDR basis is
      the operative one for a given record, it may have to be refused instead,
      and there is no refusal path in the code.
- [ ] Where the key ring lives in production, and who can read it.

**These do not block implementation.** They block the claim that the posture is
compliant, and they must be resolved before production release.

## Alternatives considered

- **Verify by a link rather than a code.** Rejected: a link in an email is a URL
  that grants something, which is the shape `notifications.md` rule 4 is most
  concerned about, and it survives forwarding in a way six digits read aloud do
  not.
- **Verify only for a first-time address, and remember the browser.** Rejected
  for now: a remembered browser is a cookie that grants access to regulatory
  documents, and a shared laboratory machine is the ordinary case rather than
  the exception.
- **Keep the address unverified and mark records "unverified".** Rejected: it
  keeps the traceability record's weakness and adds a column describing it.
- **Verify at download rather than at resolution.** Rejected as a distinction
  without a difference — resolution returns the signed download URLs.
