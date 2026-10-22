# Operations

Runbooks for the production host. `docs/engineering/` says how the system is
built; these say how to run it. Each one is written to be followed by someone
who did not build it, at a bad moment.

| Runbook | When |
|---|---|
| [deploy.md](deploy.md) | First installation, every release, rolling a release back |
| [backup-restore.md](backup-restore.md) | Where the backups are, who can decrypt them, how to restore, the quarterly drill |
| [monitoring.md](monitoring.md) | What is scraped, what is alerted on, and at what threshold |
| [incidents.md](incidents.md) | SMTP down, a wrong IFU published, an erasure request, a key to rotate or retire |

## The shape of the deployment

One host, Docker Compose, `infra/docker/docker-compose.production.yml`:

```
visitor ──https──▶ TLS proxy ──http──▶ web (nginx, 127.0.0.1:8080) ──▶ backend :8000
                   (yours, in front)                                    │
                                                        postgres, redis (private network)
                                                        backup  (nightly, encrypted)
```

The TLS proxy is **not** part of the composition. Whatever it is, it must send
`X-Forwarded-Proto: https` and append to `X-Forwarded-For`, and it counts as a
hop: `TRUSTED_PROXY_COUNT=2` behind one proxy.

Data stays in Türkiye (ADR-0006): the host, the object storage, the SMTP relay
and the off-host backup bucket.

## What CI already proved

The `Production images` job (`infra/ci/smoke-production.sh`) builds these
images and runs the release sequence of `deploy.md` against them on every
change: migrate, bootstrap twice, start, readiness through nginx, a hashed
asset, the security headers, the Academy switch, and one backup decrypted and
listed with `pg_restore`. It does not prove the TLS proxy, SMTP delivery or the
object store, which exist only on the host.
