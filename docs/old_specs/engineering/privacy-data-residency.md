# Privacy and Data Residency

## Regulatory context

Bioeksen Portal processes personal data of individuals in Türkiye on
infrastructure in Türkiye. The governing regime is **KVKK** (Kişisel Verilerin
Korunması Kanunu, Law No. 6698). Where a user is in the EU/EEA, GDPR may apply
in parallel.

This is engineering documentation, not legal advice. Bioeksen's legal function
owns the policy; engineering owns making the policy enforceable and changeable
without a rewrite.

## e-IFU access data

The e-IFU flow collects personal data from unauthenticated users. Current design
may retain:

- email
- first name / last name when policy enables them
- IP address
- Catalog Number
- LOT Number
- resolved IFU/version
- viewed/downloaded language/file
- timestamp
- request context as approved

Stored in `EIFUAccessRecord` — see `data-model-fields.md`.

### Retention — ten years, then anonymised; erased earlier on request

**ADR-0018** decides it, superseding ADR-0016's indefinite retention; **ADR-0017**
encrypts the identifiers at rest, which is what makes retaining them for ten
years arguable at all; **ADR-0007** carries the reasoning and the legal
questions that remain open.

| | |
|---|---|
| Identifiers (`email`, `first_name`, `last_name`, `ip_address`, and the `visitor_id` that joins a record to the click stream) | **Encrypted at rest** (ADR-0017). Retained **ten years** (`EIFU_ACCESS_RECORD_RETENTION_DAYS`, default `3650`), then anonymised: cleared, and stamped `anonymised_at`. Cleared earlier on request. |
| The address itself | **Proved with a one-time code** before a document is released (ADR-0018), so the identity on the record is one somebody demonstrated. |
| The access event (catalog number, LOT, resolved version, outcome, language, action, timestamp) | Retained; it identifies nobody once the identifiers are cleared. |
| Reading the identifiers | One audited endpoint, behind `eifu.access_record.view_raw` (ADR-0017). |
| Erasure mechanism | `POST /api/v1/privacy/erasure`, behind `platform.system.administer`, audited, in one transaction. No self-service path: the e-IFU flow is unauthenticated, so a request is verified out of band. |
| Lawfulness | ADR-0018 is accepted for implementation with **legal review pending** (ADR-0018, *Status*). The compliance claim waits on it; the implementation does not. |

The scheduled pass runs in `SchedulerService` (hourly, behind a distributed
lock) and calls `EifuAccessService.anonymiseExpired`. `0` disables it. The
database refuses an anonymised row that keeps any identifier
(`eifuaccess_anonymised_keeps_no_handle`).

**Anonymise, never delete the row.** Deleting whole records would destroy the
traceability history and the analytics along with the identifiers. Clearing the
identifying columns satisfies KVKK Art. 7 — which names anonymisation alongside
erasure — while leaving intact the record that a given LOT's IFU was accessed.

Requirements:

1. The period is the setting `EIFU_ACCESS_RECORD_RETENTION_DAYS`, never a
   constant in query code. A revised legal position must be a configuration
   change, not a migration project.
2. The retention job clears the identifying columns, stamps `anonymised_at`, and
   touches nothing else. It is idempotent and batched (`performance.md`).
3. Each run writes **one** `AuditEvent` with the cutoff date and row count. A
   silent bulk mutation of personal data is not acceptable; per-row audit is noise.
4. Identifying columns stay structurally separable from analytical ones, so the
   pass is a targeted `UPDATE`.
5. The on-demand erasure path exists independently of the schedule. A data-subject
   request under KVKK Art. 11 must be satisfiable before the ten years elapse,
   and is itself audited.
6. Analytics dashboards read aggregates, never identifiers, unless the caller
   holds `eifu.access_record.view_raw` (`analytics.md`). Anonymised rows stay
   fully usable there.

Implemented in `EifuAccessService.anonymiseExpired`, run by `SchedulerService`;
`EifuAccessService.anonymiseForEmail` satisfies a KVKK Art. 11 request ahead of
the schedule, through `POST /api/v1/privacy/erasure`.

Audit records are a separate category. Retention for `AuditEvent` is indefinite
and is not affected by this decision (`audit-traceability.md`).

## Data minimisation

Collect only what the access purpose requires. Do not add a field to the e-IFU
form because it might be useful later — each field is personal data with a
retention and erasure cost.

Do not derive, infer or enrich user data from third-party sources.

## Consent and notice

Bioeksen Legal supplies the legal/privacy text. Requirements:

- The notice text is **configurable content, never hard-coded** in Python or TSX.
- Each notice revision is versioned. `EIFUAccessRecord.acknowledged_notice_version`
  records which revision the user actually accepted — an acknowledgement without
  a version reference is not evidence of anything.
- Acknowledgement is an explicit affirmative action. No pre-ticked boxes, no
  implied consent from continued use.
- **Never combine** document-access acknowledgement with marketing consent.
  Marketing/update notifications are out of scope (`notifications.md`).

## Data residency

Production data is intended to remain on infrastructure hosted in Türkiye.

- Do not add a third-party service that transfers project or personal data
  abroad without explicit review and approval. This includes analytics SDKs,
  error-tracking services, CDNs that cache responses, email delivery providers,
  and any AI/LLM API called with production data.
- Object storage endpoints and any replication targets must be in Türkiye
  (`object-storage.md`).
- Cross-border transfer under KVKK Art. 9 requires a specific lawful basis. Treat
  every new external dependency as a residency question first and a technical
  question second (`dependencies.md`).
- Development and test environments must not be seeded with production personal
  data. Use generated fixtures.

## Logging

Personal data does not belong in application logs. Log the `correlation_id` and
non-identifying context; the identifiable record lives in `EIFUAccessRecord`
under access control. See `logging-observability.md`.
