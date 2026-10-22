# Monitoring

The composition exports what to alert on; it does not include the monitoring
stack. Run Prometheus (or anything that reads its format) and an alert route
of your choice beside it, and an uptime check **outside** the host.

## What is exported

`GET /metrics` on the backend, `Authorization: Bearer $METRICS_TOKEN`. It is
not under `/api/`, so the public nginx never proxies it: scrape
`backend:8000/metrics` from a container attached to the composition's `edge`
network (`bioeksen-portal-production_edge`).

| Metric | Type | Meaning |
|---|---|---|
| `bioeksen_http_requests_total{method,route,status}` | counter | Requests handled, by matched route |
| `bioeksen_http_request_duration_seconds{method,route}` | histogram | Latency |
| `bioeksen_email_send_failures_total` | counter | Messages the SMTP relay refused or never took |
| `bioeksen_storage_errors_total{operation}` | counter | Object-store calls that failed |
| `bioeksen_scheduler_job_failures_total{job}` | counter | Scheduled jobs that threw |
| `bioeksen_scheduler_last_pass_timestamp_seconds` | gauge | When a scheduler pass last finished on this instance |

Plus the default Node.js process metrics.

`GET /api/health/ready` is public and answers 200 only when Postgres and Redis
do. `GET /api/health` has the full report (pool, memory, disk) behind an
operator JWT (`OPERATOR_JWT_*`), which this composition does not configure; it
answers 401 until it does.

## Alerts

Every one of these is a condition in which a laboratory cannot get an IFU, or
soon will not, or the record of who got one is at risk.

| Alert | Condition | Why |
|---|---|---|
| Down | External check of `https://<host>/api/health/ready` fails for 2 minutes | Nobody can get an IFU |
| TLS expiring | Certificate expires within 14 days (external check) | Same, on a date you can see coming |
| Server errors | `sum(rate(bioeksen_http_requests_total{status=~"5.."}[10m])) / sum(rate(bioeksen_http_requests_total[10m])) > 0.02` | Something is failing for a share of callers |
| Email failing | `increase(bioeksen_email_send_failures_total[15m]) > 0` | The one-time code does not arrive, so the download never releases (ADR-0018). Every failure matters; see `incidents.md` |
| Storage failing | `increase(bioeksen_storage_errors_total[15m]) > 0` | Downloads or uploads failing |
| Scheduler stalled | `time() - bioeksen_scheduler_last_pass_timestamp_seconds > 3 * 3600` | Hourly passes have stopped: anonymisation and key rotation are not running |
| Scheduler job failing | `increase(bioeksen_scheduler_job_failures_total[2h]) > 0` | One job keeps throwing; the log line has the reason |
| Backup stale | The `backup` container is `unhealthy` (last good backup over 26 hours old) | `docker inspect --format '{{.State.Health.Status}}' bioeksen-portal-production-backup-1` from a host check, or a container-health exporter |
| Disk | Host filesystem holding Docker volumes over 80% | Postgres stops accepting writes when it fills |

The scheduler gauge is per instance and starts empty: after a restart it is
absent until the first pass, about an hour later. Alert on its absence only
after that.

## Logs

JSON to stdout, rotated by Docker (50 MB x 5 per service). Request logs carry
the correlation ID the response returns, and record client networks as /24
(IPv4) or /48 (IPv6), never a full address. `$C logs --since 1h backend` is
where every alert above leads next.
