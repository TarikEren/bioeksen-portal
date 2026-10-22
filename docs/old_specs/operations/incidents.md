# Incidents

`C` is the compose command from `deploy.md`.

## The SMTP relay is down

**What people see.** The e-IFU form accepts an address and no code arrives. The
download is released only after the code is entered (ADR-0018), so nobody can
get an IFU. Invitations and password resets stop too.

**How you know.** The `Email failing` alert (`monitoring.md`);
`$C logs --since 30m backend | grep -i smtp` shows the relay's code and the
failing command, never the message or the recipient.

**What to do.**

1. Confirm it is the relay, not the host: from the host,
   `nc -vz $SMTP_HOST $SMTP_PORT`.
2. Fix or fail over the relay. If the replacement has a different host or
   credentials, change `SMTP_*` in the environment file and `$C up -d backend`.
   It must be in Türkiye (ADR-0006) and support STARTTLS (production requires
   it on every port but 465).
3. Nothing to replay: codes are not queued. People who tried simply ask again,
   and the per-address limits (3 per 10 minutes, 10 per day) apply as usual.

There is no bypass that releases a document without the code, and none should
be added under pressure: the verified address is what the access record is
worth.

## A wrong IFU was published

Withdraw it; never delete it. Withdrawal removes the version from resolution
and keeps the row, the file and the audit trail.

1. Backoffice → the document → the version → **Withdraw**, with a reason
   (`eifu.document.withdraw`: IFU Manager, Platform Administrator).
2. Answer **reopen the previous version?** by why it was withdrawn
   (`state-machines.md`, *What happens to the period a withdrawal leaves
   behind*):
   - published in error (wrong product, wrong file): **reopen** -- the state
     before the mistake is the correct one;
   - the content itself is recalled: **leave the gap**. LOTs in that period
     then get "no applicable version" until a corrected version is published,
     which is the intended loud failure.
3. Publish the corrected version when quality releases it.
4. Who downloaded the wrong one, and when, is in the e-IFU access records
   that resolved to that version (`resolved_document_version_id`). Reading an identity is an audited act with a reason
   (ADR-0017): only do it when the recall procedure asks for it.

## An erasure request

A person asks, under KVKK Art. 11, to be erased from the e-IFU records.
Verify who they are **out of band first** -- the e-IFU flow has no accounts, so
anyone can claim any address.

There is no screen for this yet. As a platform administrator
(`platform.system.administer`):

```bash
H=https://<host>; J=$(mktemp)
curl -s -c "$J" -b "$J" "$H/api/v1/auth/csrf" -o /dev/null
T=$(awk '$6=="bioeksen_csrf"{print $7}' "$J")
curl -s -c "$J" -b "$J" -H "x-csrf-token: $T" -H 'content-type: application/json' \
  -d '{"email":"<you>","password":"<your password>"}' "$H/api/v1/auth/sign-in" -o /dev/null
T=$(awk '$6=="bioeksen_csrf"{print $7}' "$J")   # signing in issues a new token
curl -s -b "$J" -H "x-csrf-token: $T" -H 'content-type: application/json' \
  -d '{"email":"<their address>","reason":"KVKK request <ref>, identity verified by <how>"}' \
  "$H/api/v1/privacy/erasure"
rm -f "$J"
```

It answers `{"anonymised": n, "analytics_events": m}`. The access events are
kept with their identifying columns cleared and `anonymised_at` stamped; the
analytics events linked to the same browser and account are anonymised in the
same transaction; an audit event records the request. Irreversible. Reply to
the person with the date and the counts.

## Rotating the identity key

The e-IFU identity columns are encrypted with the first entry of
`EIFU_IDENTITY_KEYS`; each row records the key id it was written with
(ADR-0017). Rotate yearly, and at once if a key may be exposed.

1. Generate a new entry: `echo "k$(date +%Y%m):$(openssl rand -base64 32)"`.
2. Escrow it with both custodians (`backup-restore.md`).
3. Put it **first** in `EIFU_IDENTITY_KEYS`, keeping the old entries after it,
   and `$C up -d backend`. New rows use it at once.
4. The hourly scheduler re-encrypts older rows onto it, 500 per batch. Watch
   progress:

   ```bash
   $C exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
     SELECT identity_key_id, count(*) FROM eifu_access_records
      WHERE anonymised_at IS NULL GROUP BY 1"'
   ```

5. When no row names the old id, remove it from the ring and `up -d` again.
   Keep its escrowed copy until every backup made before step 5 has aged out,
   because a restore of one of those needs it.

`EIFU_IDENTITY_LOOKUP_PEPPER` does **not** rotate: changing it orphans every
lookup hash, and erasure requests then find nothing.

Removing a key whose rows were not re-encrypted leaves them unreadable. That
is the end state of a retired key, not an error to repair, and it is never a
substitute for an erasure request.
