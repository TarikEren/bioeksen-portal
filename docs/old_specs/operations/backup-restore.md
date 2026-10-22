# Backup and restore

## What is backed up, and where

| What | How | Where |
|---|---|---|
| PostgreSQL | `pg_dump -Fc`, encrypted with `age` before it touches the disk, nightly at `BACKUP_HOUR`:30 UTC and once on first start (`infra/backup/backup.sh`) | Volume `bioeksen-portal-production-backups` for `BACKUP_LOCAL_DAYS` (7); copied to `BACKUP_S3_BUCKET` when set |
| IFU files and course media | Bucket versioning (`infra/storage/provision.sh`); replication is the storage provider's | The object store |
| Redis | Not backed up. Sessions, rate-limit counters and codes in flight: losing them signs everybody out and nothing else | -- |

**Set `BACKUP_S3_BUCKET`.** Without it every copy is on the host it is meant to
survive. The bucket is in Türkiye (ADR-0006), is not writable with the
application's key, and keeps history with its own lifecycle rule -- 90 days of
nightlies is a reasonable start; quality decides the real figure.

## What is deliberately NOT beside the backups

- `EIFU_IDENTITY_KEYS` and `EIFU_IDENTITY_LOOKUP_PEPPER` (ADR-0017). A dump of
  encrypted columns stored with the key that decrypts them is not encrypted.
- The `age` identity that decrypts the backups. The host has only the public
  half (`BACKUP_AGE_RECIPIENT`), so a compromised host cannot read its own
  backups.
- `/etc/bioeksen/production.env` as a whole.

## Key escrow

Three secrets are held **off the host, by two named people**, each copy in a
password manager or sealed envelope the other cannot open alone:

1. the backup `age` identity (`AGE-SECRET-KEY-1...`),
2. `EIFU_IDENTITY_KEYS` -- every entry still on the ring, and every retired one
   whose rows have not all been re-encrypted,
3. `EIFU_IDENTITY_LOOKUP_PEPPER`.

Record who the two are, and the date they last confirmed they can still open
their copy, somewhere the quarterly drill checks. When one leaves Bioeksen,
generate a new backup identity (below) the same week.

A restore needs (1). Reading the identity columns after a restore also needs
(2) and (3), which the restored backend reads from the environment file as it
always does.

## Restoring

On the host, or on a replacement one prepared with `deploy.md` steps 1-3 and
the **same** key ring and pepper.

```bash
C="docker compose -f infra/docker/docker-compose.production.yml --env-file /etc/bioeksen/production.env"

# 1. Stop everything that writes. Postgres stays up.
$C stop web backend backup

# 2. Pick the dump: local, or fetched from the off-host bucket.
$C run --rm --no-deps --entrypoint sh backup -c 'ls -l /backups'

# 3. Put the identity where the container can read it, for this command only.
#    Held by one of the two custodians; deleted again in step 5.
( umask 077; cat > /root/restore-identity.txt )        # paste, then Ctrl-D

# 4. Restore into the existing database, replacing its contents. As root in
#    the container, because the identity file is root's and 0600.
$C run --rm --no-deps --user root -v /root/restore-identity.txt:/tmp/identity.txt:ro \
  --entrypoint sh backup -c \
  'age -d -i /tmp/identity.txt /backups/<file>.dump.age \
     | pg_restore -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error'

# 5. Remove the identity, start, check.
shred -u /root/restore-identity.txt
$C --profile release run --rm migrate     # only if code is newer than the dump
$C up -d
curl -fsS https://<host>/api/health/ready
```

After a restore, write down the window between the dump and the incident. Any
e-IFU access in that window is missing from the traceability record, and
quality has to know.

## The quarterly drill

A backup nobody has restored is a hope. Once a quarter, on a machine that is
not production:

1. Fetch last night's dump from the off-host bucket (not from the host).
2. Restore it with step 4 above into a scratch Postgres 16.
3. Check it: row counts of `products`, `document_versions`, `lots` and
   `eifu_access_records` are within a day of production's.
4. Have the **second** custodian do the decryption, so both copies are proved.
5. Record the date, who, the dump's age and the restore time. Destroy the
   scratch database.

`infra/ci/smoke-production.sh` proves on every change that a backup this job
writes decrypts and lists. The drill proves that the one in the bucket does,
with the identity the custodians actually hold.

## Replacing the backup key

When a custodian leaves, or the identity may have been exposed:

1. `age-keygen` on a custodian's machine; escrow the new identity with both.
2. Put the new public key in `BACKUP_AGE_RECIPIENT`; `$C up -d backup`.
3. Keep the old identity until every dump encrypted with it has aged out of the
   off-host bucket, then destroy it.
