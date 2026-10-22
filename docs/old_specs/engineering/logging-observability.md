# Logging and Observability

Use structured technical logs in English.

Include request/correlation identifiers for meaningful workflows.

Log useful context such as domain operation and non-sensitive entity identifiers where appropriate.

Never log passwords, access tokens, session secrets, or other authentication secrets.

Keep audit records separate from application logs.

Monitor asynchronous task failures, import failures, storage errors, and IFU resolution failures without exposing personal data unnecessarily.

## The record

`backend/src/observability/log-record.ts` emits one line per record: the six
fields `sds-logging/references/log-record.md` fixes — `id`, `timestamp`,
`severity`, `type`, `code`, `message` — with the prose fixed by the code and
everything variable in a logfmt tail inside `message`.

**The tail is also repeated as top-level JSON keys.** Loki's `| json` pipeline
reads top-level keys, so `status`, `route`, `duration_ms` and `ip` become label
filters and Prometheus recording rules directly; extracting them from the logfmt
inside `message` would need a regex per message shape, maintained separately
from the code that writes it.

The cost is that every varying value appears twice in a line. That is the trade
`sds-logging` did not have to make when nothing consumed these records. The
human-readable line is unchanged.

A tail key colliding with one of the six is written as `tail_<key>` rather than
overwriting it: `type` and `code` are what an operator filters on first, and a
record whose `code` came from a caller's tail is a record that lies about which
failure it is.

## The access record

One `ACCESS` record per request, from **middleware** rather than an interceptor.
A Nest interceptor runs after the guards, so an interceptor never saw a request
a guard rejected — every authentication failure, permission denial and rate
limit was missing from the access log entirely, which is the worst possible gap
in a security log.

It carries `method`, the matched `path` pattern, `status`, `duration_ms` and
`ip`.

- **The route pattern, never the resolved path.** `/api/v1/documents/:id` groups
  across requests; the concrete path does not, and it puts an identifier into a
  retained record for no benefit.
- **The address, from `request.ip`.** That means the app's `trust proxy`
  setting decides it, never a hand-parsed `X-Forwarded-For` — a header any
  caller can set. It is in the access log as well as in `EifuAccessRecord`
  because the two answer different questions: that table says who took which
  document, and this says where a burst of 401s came from.
- **Never a query string.** `sds-auth` forbids credentials in a URL precisely
  because they would land here, and the way to keep that true is not to write
  the query string at all.

## Metrics

`GET /metrics`, Prometheus exposition format, from `prom-client`. Node defaults
(heap, event-loop lag, GC) under the `bioeksen_` prefix, plus:

| Metric | Type | Labels |
|---|---|---|
| `bioeksen_http_requests_total` | counter | `method`, `route`, `status` |
| `bioeksen_http_request_duration_seconds` | histogram | `method`, `route` |

Two rules, and the first is the one that breaks a Prometheus deployment:

1. **Labels are bounded.** `route` is the matched pattern. A label whose values
   are unbounded creates a time series per value, and an identifier in a label
   is how a metrics server runs out of memory. A ceiling of 200 route labels is
   a second line of defence for anything reaching the middleware with no matched
   route — 404s against random URLs, which is exactly the traffic an attacker
   generates in volume.
2. **No personal data, ever.** Not in a label, not in a value. A metrics server
   has no erasure path, no access control worth the name, and a scrape interval.
   The address belongs in the access log; it must never reach a label.

### Why `/metrics` is not behind `OperatorGuard`

That guard needs an issuer, an audience and a JWKS URL Bioeksen has not supplied
(`deferred-work.md`), so it refuses every request. A metrics endpoint behind it
would be a monitoring endpoint that cannot be monitored.

It takes a shared bearer token, `METRICS_TOKEN`, compared in constant time, and
refuses everything when none is configured — the same fail-closed posture,
reached by a mechanism that can be switched on today. When the operator
credential arrives, this endpoint should move behind it.

## The client address in analytics

`AnalyticsEvent.ip_address` holds the address **encrypted at rest**, with the
same key ring as `EifuAccessRecord.ip_address` (ADR-0017). It is kept for
investigation and used by no aggregate: every dashboard is built from counts,
and none of them needs an address.

Encrypted rather than plain because it is personal data under the same rules as
an email address, and storing it beside a visitor identifier in the clear would
be a step down from the posture the e-IFU records already hold. Erasure clears
it along with the identifiers, and
`analyticsevent_anonymised_names_nobody` refuses the row otherwise — the address
identifies a household as surely as the visitor id identifies a browser.

Reading individual events, with the address decrypted, needs
`analytics.event.view_raw`, which only Platform Administrator holds. It is the
counterpart of `eifu.access_record.view_raw` and restricted for the same reason:
an event feed carrying addresses is a surveillance surface.
