# Crisis mode

## 1. Status

- In force from 2026-10-22. The decision is DEC-136 in `docs/specs/core.md`.
- Owner: the product owner.
- Crisis mode ends when the test phase after B4 passes, or when the owner
  ends it.
- While crisis mode is in force, this file replaces the stage loop of
  `bioeksen-sds:sds-planning` (`AGENTS.md` › *Build loop*).

## 2. Goal

A working e-IFU, frontend and backend, on the demo of DEC-135, as fast as
possible.

`docs/specs/` stays the only authority. Each page and each service
implements its build items and their acceptance criteria. Crisis mode changes
the order of the work and the checks. It does not change a rule of the specs.

## 3. Order of work

1. B1 Identity and platform services.
2. B2 Product catalog.
3. B3 Documents and publication.
4. B4 Public lookup. After B4, the e-IFU works from end to end.
5. The test phase for B0 to B4 (section 6).
6. B5 Personal data and operations, in the loop of section 4, and then its
   tests.

The branches stack: `feature/b1-identity` starts from `feature/b0-foundation`.
Then `feature/b2-catalog` starts from B1, and so on. Nothing merges into
`main` before the test phase passes.

## 4. The loop of each stage

| Step | Who | Output |
|---|---|---|
| 1 Contract | The main session writes it. The owner approves it | `docs/plans/test_plan.md`: the items, the exit flow, the API (paths, bodies, codes), the data (tables, migrations), the UI (pages, accessible names, dictionary keys), the service signatures and the mock data |
| 2 Mock skeleton | Backend agent | The zod schemas in `src/lib/schemas/`. The service signatures in `src/modules/<module>/services/`, which return typed data from `src/lib/mock/<domain>.ts`. Each mock carries a `MOCK:` comment with its item. The routes and the server actions call these services |
| 3 Frontend | Frontend agent | Each page of the stage, on the mock services, with HeroUI, the dictionaries and `src/app/globals.css` |
| 4 Backend | Backend agent | The migrations, the repositories and the real services, with the same signatures. Each mock goes. The audit records, the mail and the files, as the items say |
| 5 Phase review | One `code-reviewer` agent | A review of the commits of the stage only, against the items and the criteria of the stage, and against the findings that the commits claim to fix. No full review |
| 6 Fix | The developer agents | Each Critical and Major finding is fixed before the next stage starts. Each Minor finding is recorded in `docs/review_findings/` and fixed later |
| 7 Stage check | The main session | The gate of section 5 |

## 5. The gate of each stage

The stage is done when all of these are true. No new test is written.

- `pnpm run typecheck`, `pnpm run lint` and `pnpm run build` pass.
- The unit and component tests that exist stay green (`pnpm run test`). The
  FND-09.AC2 tests stay red until the owner changes the contrast tokens
  (`docs/required_changes.md`, RC-1).
- No `MOCK:` comment of the stage remains in `src/`.
- The demo starts from `compose.demo.yaml`. The main session does the exit
  flow of the stage in the browser, and keeps screenshots of it.
- The phase review has no open Critical or Major finding.

## 6. The test phase after B4

1. The tester writes the acceptance tests from the criteria of B0 to B4. The
   tester does not read the product code (`sds-testing`).
2. The tiers come in this order: unit, then integration, then e2e. Each tier
   is green before the next one starts.
3. The developers fix what the tests find.
4. The tests of B0 that exist run in their tiers in this phase.
5. CI (`docs/required_changes.md`, RC-2) gates the merge into `main`.

## 7. The rules that stay

- `docs/specs/` is the only authority. If the specs give no rule, ask the
  owner.
- The layering rules and their ESLint rules (FND-01).
- The configuration module, the logger (DEC-127), the error codes
  (`sds-logging`), the audit records (DEC-014) and no deletion of a
  controlled record (DEC-010).
- `sds-commit` for each commit: one `Change-Id` and the `Co-Authored-By`
  line. A `feat` or `fix` commit that changes no test carries
  `Test-Exempt: acceptance` (DEC-136). The test phase writes those tests.
- Nobody prints or copies a secret or a connection string. Tests and checks
  use disposable databases only.
- Nobody changes `.claude/skills/` or `.forgejo/`.
- A shell line never waits on stdin (for example, `cat > file` with no
  heredoc).

## 8. What is paused

- New tests, until the test phase after B4.
- The integration tier and the e2e tier, until the test phase.
- Full reviews. Only the phase review of section 4 runs.

## 9. Outside the build

`docs/required_changes.md` (RC-1 to RC-12) still applies. Crisis mode does not
wait for those changes.
