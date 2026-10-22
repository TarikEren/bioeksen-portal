# Local Development

Every command below is run from the repository root unless stated otherwise.

## Prerequisites

- Node.js 26 and npm — the production runtime, not only a build tool
- Docker, for PostgreSQL, Redis and MinIO
- [uv](https://docs.astral.sh/uv/) for the governance scripts in `scripts/`

uv provisions the pinned Python interpreter itself; a system Python 3.12 is not
required. There is no Python application — the scripts are governance checks.

For a step-by-step first run, including how to confirm the system works, see
[RUNNING.md](../../RUNNING.md) at the repository root. This file is the
reference for every command.

## First-time setup

```bash
make setup
```

This installs backend and frontend dependencies and copies `.env.example` to
`.env` if absent.

## Running the stack

Start PostgreSQL, Redis and MinIO:

```bash
make services-up
```

Backend API on `http://localhost:3000`:

```bash
make backend-run
```

Frontend dev server on `http://localhost:5173`, proxying `/api` to the backend:

```bash
make frontend-run
```

Stop the containers:

```bash
make services-down
```

## Database

```bash
make migrate           # apply migrations and regenerate the Prisma client
make migrate-dev       # create a migration from schema changes
make seed              # demo product, IFU revisions and LOTs to sign in against
```

**Read every migration `migrate-dev` generates before applying it.** Prisma
emits a `DROP` for constraints it can introspect but cannot express, and there
is no admin account to create — everything an operator needs is a screen with a
permission (`backend-nestjs.md`).

Never edit an applied migration: Prisma records a checksum and the database
then reads as drifted. See `database-migrations.md`.

## Tests

```bash
make test              # backend + frontend + governance script tests
make test-backend      # vitest, needs `make services-up`
make test-frontend     # vitest
make test-scripts      # pytest over scripts/tests
```

Run a single backend test:

```bash
cd backend && npx vitest run test/certificates.spec.ts
```

Each run gets its own database, dropped afterwards. `KEEP_TEST_DATABASE=1`
keeps it, for when the reason a test failed is in the rows (`testing.md`).

## Linting, formatting and type checks

```bash
make lint              # ruff + eslint + tsc --noEmit + prettier --check
make format            # ruff format + prettier --write
```

## Governance checks

These enforce project invariants that a linter cannot express:

```bash
make check             # runs every governance script in blocking mode
```

Individual scripts, all of which accept `--json`:

```bash
python3 scripts/validate_project_structure.py .
python3 scripts/validate_translations.py frontend/src
python3 scripts/check_forbidden_patterns.py .
python3 scripts/check_database_constraints.py .
python3 scripts/validate_bioeksen_lot.py B2603091224GHPVV
```

Advisory findings — `validate_translations.py`'s warnings,
`check_forbidden_patterns.py` in its default mode — are reported for human
review and exit `0`. Pass `--strict` to make them fail the run, which is what
`make check-strict` and CI do. See `scripts/README.md`.

`check_database_constraints.py` is not advisory. `CONSTRAINT_MISSING` means a
guarantee is gone.

## Full pre-push gate

```bash
make verify
```

Runs `lint`, `check`, and `test`.

CI runs the same commands with one deliberate difference: the governance checks
run with `--strict`, so a finding this target reports as a warning fails there.
`make verify-strict` is the local equivalent of what CI gates on. The asymmetry
is intentional — a warning should not block someone mid-change, and it should
block a merge.

## Environment variables

`.env.example` is the authoritative list. Never commit a populated `.env`.
Never place a secret in a `VITE_`-prefixed variable: those are inlined into the
browser bundle. See `security.md`.
