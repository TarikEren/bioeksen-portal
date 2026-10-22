# Audit and Traceability

Audit is not application logging and not learner analytics.

## Audit events

Audit controlled changes such as:

- IFU upload/replacement
- LOT-specific applicability override
- Catalog/Lot correction affecting resolution
- course review/approval/publication/supersession
- role/permission changes
- certificate issuance/revocation where relevant

Capture where applicable:

- actor
- action
- entity type/id
- timestamp
- request/correlation identifier
- previous/new state or structured change metadata
- reason

Audit records must not be silently editable or auto-purged. Current retention is indefinite.

## Analytics

Learner page views, durations, scores, completion rates, question performance, simulation errors, e-IFU search/download patterns, and similar usage belong to analytics.

Routine dashboards should use aggregated data. Raw identifiable e-IFU access reporting should be restricted to authorized users such as administrators/authorized management reporting roles.

Usage measurement belongs in `analytics.md`. Operational messaging belongs in `notifications.md`. Neither is an audit record.
