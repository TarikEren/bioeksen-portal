# Required changes from outside the build

This file lists the changes that the build agents cannot make. A person, the
SDS owner or IT must make them. Each row names the stage that waits for it.
`docs/specs/` stays the only authority: each row cites the decision or the
criterion that needs the change.

When a change is done, set its state to **Done** with the date and the
commit or the answer. Do not delete a row.

## Blocks the exit of B0

| # | Change | Who | Why | State |
|---|---|---|---|---|
| RC-1 | Change the tokens of `src/app/globals.css` so that each pair of the reference page meets WCAG 2.2 AA. Today 8 pairs fail in the light theme, 11 in the dark theme, and 8 + 8 in `.sidebar-theme`. The list with the ratios is in `docs/plans/test_plan.md` › *Open point for the exit* | Product owner | FND-09.AC2, DEC-015, DEC-018 | Open |
| RC-2 | Add `.forgejo/workflows/ci.yml` from [`docs/plans/ci-proposal.md`](plans/ci-proposal.md), in an `ops` commit. Before that, put the digest of the estate CI image in place of `CI_IMAGE@sha256:DIGEST` | Product owner (a person: `sds-ci` lets no agent write `.forgejo/`) | FND-02.AC1 to AC3, FND-07.AC5 | Open |
| RC-3 | Pin the `bioeksen-sds` release in `.claude/settings.json`, and keep it equal to `SDS_TAG` of the workflow (`0.9.0` today) | Product owner | `sds-ci` › **The jobs** | Open |
| RC-4 | Add a commit-check script to the `bioeksen-sds` kit, and give its path. Release 0.9.0 has none, so the `commits` job of the workflow reports "not run" and fails | SDS owner | FND-02.AC3 | Open |
| RC-5 | Make the check `ci` the one required check of `main` (branch protection of the forge) | Forge administrator | FND-02 rule 3 | Open |
| RC-6 | A CI runner (`ci` label) for the pull request pipeline, with the estate CI image | IT | FND-02 | Open |

## Needed before the release (B3 to B5)

| # | Change | Who | Why | Needed in | State |
|---|---|---|---|---|---|
| RC-7 | The Entra ID values of `sds-auth` for this app, and the test and production servers. Until then, the app runs as a demo from `compose.demo.yaml` (DEC-135) | IT | DEC-135 (`questions.md` 27), FND-03, FND-04 | B5 | Open |
| RC-8 | Deployment by a release tag, through the deploy repository of IT, to the test environment | IT | DEC-128 (`questions.md` 25), FND-02.AC4 | B5 | Open |
| RC-9 | The object store refuses a write with `If-None-Match: *` to a key that exists | IT | PLT-10 | B3 | Open |
| RC-10 | The public address of the object store, for the signed download links | IT | DEC-132 (`questions.md` 26), IFU-60 | B4 | Open |
| RC-11 | A source for the alerts of PLT-70. DEC-034 expects the alerts to read the log aggregator, but DEC-127 (no `@bioeksen/sdk`) sends nothing there. Either the SDK arrives, or a new decision gives IT another source | Product owner, IT and SDS owner | PLT-70, DEC-034, DEC-127 | B5 | Open |

## Not blocking

| # | Change | Who | Why | State |
|---|---|---|---|---|
| RC-12 | The reverse proxy refuses the HTTP methods outside RFC 9110 (for example `TRACE`), because Next.js answers them under `/api` with a bare 400 | IT | Review finding R-047 | Open |
