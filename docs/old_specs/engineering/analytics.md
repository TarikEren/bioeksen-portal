# Analytics

Analytics answers "how is the platform being used". It is **not** the audit trail
and **not** application logging. Read `audit-traceability.md` for that boundary.

## Principle

Audit is evidence; analytics is measurement. Analytics data may be aggregated,
sampled, re-derived and — subject to policy — eventually pruned. Audit data may
not. Never satisfy an analytics requirement by querying `AuditEvent`, and never
satisfy an audit requirement by querying analytics.

## Product usage

Every page view and every click, recorded as `AnalyticsEvent`. Decided by
project ownership on 2026-09-06.

- page views and clicks per day, and how many distinct browsers
- the most-visited routes and the most-clicked controls, per area

Three rules make this measurable without becoming a second identity store:

1. **The route pattern, not the URL.** `/backoffice/documents/:id`. Record ids
   are not something analytics needs, and a pattern aggregates without a
   `GROUP BY` over unbounded distinct values.
2. **Click labels are authored, never derived.** A `data-analytics` attribute
   in lower case. Deriving the label from the visible text would make the
   Turkish and the English of one button look like two, and an unlabelled click
   is not recorded at all — a label is somebody having decided the control is
   worth measuring.
3. **The collector decides nothing.** It is unauthenticated and CSRF-exempt,
   because it runs on the public pages; that is only acceptable while nothing
   reads these rows to make a decision. Gating a feature on this table would
   make a forged event matter, and then the exemption has to go.

## Academy metrics

- enrollment, start and completion counts per course and version
- completion rate and median time-to-completion
- assessment pass rate, score distribution, attempt counts
- per-question success rate, for identifying badly written questions
- activity/simulation error counts and completion rates per block
- organization-level training status and overdue counts
- certificate issuance, expiry and revocation counts

## e-IFU metrics

- lookup volume over time
- successful vs failed resolutions, broken down by `outcome` code
  (`error-codes.md`) — a rising `EIFU_NO_APPLICABLE_VERSION` rate is a data defect signal
- language selected, view vs download
- product and catalog-number demand trends

## Access rules

| Data | Permission | Notes |
|---|---|---|
| Aggregated dashboards | `analytics.report.view` (org-scoped) | The default for all routine reporting. |
| Aggregated e-IFU metrics | `eifu.access_record.view_aggregated` | No personal fields. |
| Raw `EIFUAccessRecord` rows | `eifu.access_record.view_raw` | **Restricted.** Contains email and IP. |

An organization-scoped viewer sees their own organization's learners, and — only
through an active `DISTRIBUTES_TO` relationship with the matching permission —
their customers'. Never other organizations.

## Implementation rules

1. **Aggregate in the database.** Analytics endpoints return computed aggregates.
   Never ship raw event rows to the browser and reduce them there
   (`performance.md`).
2. **Bounded responses.** Every analytics endpoint is paginated or windowed by a
   required date range. There is no "all time, all rows" endpoint.
3. **Minimum aggregation threshold — analytics only.** An *aggregate* breakdown
   covering fewer than 5 learners must not be exposed, because a small cohort
   average re-identifies the individuals in it. Report a suppressed bucket
   instead of a number.

   **This does not apply to operational training-progress screens.** An
   Organization Manager holding `organization.progress.view` is authorised to see
   their own members by name — that is the requirement, not a privacy leak:

   ```
   Ahmet Yılmaz    completed
   Ayşe Demir      overdue
   Mehmet Kaya     80%
   ```

   A customer with three employees must still get that list. Suppressing it would
   break the product for exactly the organizations that need it most.

   The line is **purpose, not row count**:

   | Surface | Permission | Rule |
   |---|---|---|
   | Aggregate analytics, cross-organization comparison, trend reporting | `analytics.report.view` | Suppress cohorts below 5. |
   | Operational training progress for one's own permitted scope | `organization.progress.view` | Named, per-person. No suppression. |

   Suppression protects people from being inferred out of a statistic. It was
   never meant to hide a roster from the manager responsible for it.
4. **Pre-compute the expensive ones** when they need it. Daily rollup tables,
   filled by `SchedulerService`, for metrics that would otherwise scan the full
   attempt history. None exist yet: every report today is one aggregate query
   over a required date range. Rollups are derived data and may be rebuilt
   from source at any time.
5. **Analytics reads never block a learner.** Reporting queries run against
   rollups or a read path that cannot lock learner-facing writes.
6. **Retention.** e-IFU access identifiers are retained ten years, then
   anonymised (ADR-0018), and are cleared earlier on request (ADR-0016). Analytics is unaffected
   either way **by design** — every metric in this file is computed from
   non-identifying columns, so a record whose identifiers were erased this
   morning contributes exactly as much as a fresh one. Rollups are permanent.

   That property is not incidental and must be preserved: **any metric that
   would break when identifiers are cleared is a metric that should not have
   been built on identifiers.** It is what lets an erasure request be answered
   without weighing it against a reporting requirement.

## Personal data

`EIFUAccessRecord` is personal data. Analytics queries over it must select
aggregates, not identifiers, unless the caller holds
`eifu.access_record.view_raw`. See `privacy-data-residency.md`.
