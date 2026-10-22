# Deploy

Every command below is run from the repository checkout on the host, with

```bash
C="docker compose -f infra/docker/docker-compose.production.yml --env-file /etc/bioeksen/production.env"
```

The existence of `/etc/bioeksen/production.env` is also what makes `./start.sh`
and `make services-reset` refuse to run on this host: both would otherwise
delete volumes.

## First installation

### 1. The host

- Docker Engine with the Compose plugin.
- A TLS proxy in front (host nginx, a load balancer, an ingress). It forwards
  to `127.0.0.1:8080` (`HTTP_BIND`), sends `X-Forwarded-Proto: https`, appends
  to `X-Forwarded-For`, and allows request bodies of at least 21 MB (IFU
  uploads). Nothing in the composition listens on 443.
- Outbound access to the SMTP relay and the object store. Nothing else.

### 2. The object store

Three buckets, private, with versioning on the two that hold controlled
content and a one-day expiry on the upload staging bucket:

```bash
S3_ENDPOINT_URL=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
  infra/storage/provision.sh
```

Idempotent; run it again whenever in doubt. Give the application its own
access key limited to these three buckets. Its key ID appears in every signed
download URL, so it must not be a key that can do anything else.

### 3. The environment file

`/etc/bioeksen/production.env`, mode `0600`, owned by root, **never** in the
repository and **never** in the backups. `docker-compose.production.yml` lists
every variable in its header; each one without a default is required and
`docker compose` stops before starting anything if it is missing.

Generate secrets rather than typing them:

```bash
openssl rand -hex 32                      # POSTGRES_PASSWORD, REDIS_PASSWORD, SESSION_SECRET, METRICS_TOKEN
echo "k$(date +%Y%m):$(openssl rand -base64 32)"   # EIFU_IDENTITY_KEYS
openssl rand -hex 32                      # EIFU_IDENTITY_LOOKUP_PEPPER
age-keygen                                # BACKUP_AGE_RECIPIENT -- see backup-restore.md
```

Hex, because `POSTGRES_PASSWORD` and `REDIS_PASSWORD` go into URLs and a `/`
or `@` in them breaks the connection string.

`EIFU_IDENTITY_KEYS`, `EIFU_IDENTITY_LOOKUP_PEPPER` and the backup identity
are escrowed as described in `backup-restore.md` **before** the first person
downloads an IFU. Lose the key ring and the identity columns are unreadable
for good; lose the pepper and erasure requests find nothing.

`ACADEMY_ENABLED` is `false` unless set: e-IFU is served, the Academy's routes
answer 404 and its scheduled jobs do not run.

### 4. Build, migrate, bootstrap, start

```bash
$C --profile release build
$C --profile release run --rm migrate
BOOTSTRAP_ADMIN_EMAIL=first.admin@bioeksen.com.tr $C run --rm -e BOOTSTRAP_ADMIN_EMAIL backend node dist/cli/bootstrap.js
$C up -d
```

Bootstrap makes permissions and roles match the registry, creates Bioeksen as
the INTERNAL organization, and -- only while no active platform administrator
exists -- creates one for `BOOTSTRAP_ADMIN_EMAIL` and emails them an
invitation. No password is set or printed. It exits `2` when no administrator
exists and no address was given. If the invitation did not arrive (SMTP), run
the same command again: it re-sends.

### 5. Check

```bash
$C ps                                             # every service healthy
curl -fsS https://<host>/api/health/ready         # {"status":"ok",...}
curl -sI https://<host>/ | grep -i content-security-policy
```

Then sign in as the administrator from the invitation, and look up one real
LOT end to end, including the emailed code.

## Every release

```bash
git fetch --tags && git checkout <release tag>
$C --profile release build
$C run --rm backup once                           # only if the release has a migration
$C --profile release run --rm migrate
$C run --rm backend node dist/cli/bootstrap.js    # exits 2 only while no administrator exists
$C up -d
```

Bootstrap runs on every release because it is how a change to
`permission-matrix.md` reaches production. Migrations never run on start: a
container that migrates on boot migrates once per replica and races itself.

`up -d` replaces the backend; it drains for up to 30 seconds
(`stop_grace_period`). nginx resolves the backend per request, so it does not
need restarting.

## Rolling back

Prisma migrations only go forward. Which rollback applies depends on the
release:

**No migration in the release.** Check out the previous tag, build, `up -d`.

**A migration that only added** (a table, a nullable column, an index). The
previous code ignores what it does not know: roll back the code as above and
leave the schema. The next release carries the migration already applied.

**A migration that changed or removed something the previous code reads.**
The previous code will fail against the new schema. Restore the backup taken
just before the migration (`backup-restore.md`), then roll back the code.
Everything written between the backup and the restore is lost -- including
e-IFU access records, which are the traceability record -- so write down the
window and say so to quality.

Which of the three a release is must be decided before it ships, not during
the incident: write it in the release notes beside the tag.
