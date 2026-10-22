# Bioeksen Portal

| | |
|---|---|
| **Project name** | Bioeksen Portal |
| **Software id** | `bioeksen-portal`, in `.bioeksen/software-id` (DEC-021 is pending) |

## What this is

Bioeksen Portal gives each user the correct Instructions for Use (IFU) for a
Bioeksen product and LOT. This is e-IFU, release 1. Release 2 adds training
(the Academy).

## Authority

- `docs/specs/` is the only authority for the build. Start with
  `docs/specs/README.md`.
- `docs/questions.md` holds the questions to the owners, in Turkish.
- `docs/old_specs/` is history. Do not build from it.
- If the specs give no rule, ask the product owner.
- This file points to the specs and names the paths and the commands. It
  holds no rule of its own.

## Build loop

Build each stage of `docs/specs/README.md` › *Build order* with the stage
loop of `bioeksen-sds:sds-planning`. The main session writes
`docs/plans/test_plan.md` for the stage. `qa-engineer` writes the acceptance
tests from the criteria, and does not read the product code.

## Commands

FND-01 adds the scripts that do not exist yet.

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run test:integration
pnpm run test:e2e
pnpm run build
python <sds-planning>/scripts/check_specs.py --specs docs/specs
```

Before you hand back work, run `typecheck`, `lint` and `build`.

## Data

The values that `bioeksen-sds:sds-database` asks the project to name:

| Item | Value | Source |
|---|---|---|
| Database engine | PostgreSQL 16 | DEC-004 |
| ORM | Prisma 8 RC, `@prisma/orm-postgres` 8.0.0-rc.18 (exact version). Read its skill in `node_modules/@prisma/orm-postgres/skills/prisma-8/` before data work | DEC-005 |
| Source of truth | `src/prisma/contract.prisma`. `contract.json` and `contract.d.ts` are generated, and the repository holds them | DEC-005 |
| Migrations | `src/prisma/migrations/`, forward only. An exclusion constraint, an extension or a trigger is a `rawSql` operation in the migration that creates its table | DEC-005, FND-06 |
| Change the schema | `pnpm prisma contract emit`, then `pnpm prisma migration plan --name <slug>`, then `pnpm prisma db migrate --advance-ref db`. Never `db update` | FND-06 |
| Drift check | `pnpm db:check` | FND-06 |
| Table names | snake_case, with the module name as the prefix (`catalog_lot`), in the schema `public` | DEC-004 |
| Keys | `bigint` from a sequence (`BIGSERIAL`), strings in JSON | DEC-009 |
| Disposable databases | `bioeksen_portal_<role>_integration` and `bioeksen_portal_<role>_e2e`: one database for each worktree | DEC-004, FND-06 |

## Code layout

All code is under `src/`. See `docs/specs/core.md` › *Code layout*.

## Interface

- `src/app/globals.css` holds the palette and the HeroUI token map. Use it as it
  is, and add no color (DEC-015).
- Components are HeroUI v3, per `bioeksen-sds:sds-nextjs-frontend`. The
  HeroUI skill is in `.claude/skills/heroui-react/`.
- Interface text is in `src/lib/i18n/dictionaries/`. `tr.ts` is the source, and
  `en.ts` is typed against it (FND-08).
- The reference page of the palette and the contrast is
  `references/ui-reference.html` of `sds-nextjs-frontend`.

## BioEksen standards

Use the `bioeksen-sds` skills where they apply:

| Skill | Use when |
|---|---|
| `sds-planning` | You write or change the specs, or plan a stage |
| `sds-api-design` | You design or build an endpoint or a server action |
| `sds-auth` | You protect an endpoint or choose a rejection code |
| `sds-logging` | You write a log record or choose an error code |
| `sds-config` | You add or read a setting |
| `sds-database` | You change the schema, a migration or a query |
| `sds-nextjs-backend`, `sds-nextjs-frontend` | You write server code or interface code |
| `sds-testing` | You write or run tests |
| `sds-reviewing` | You review a change |
| `sds-commit` | You write a commit message |
| `sds-ci` | You change the pipeline |

## Conventions

- Write answers and documents in ASD-STE100 (Simplified Technical English).
- Log through `src/lib/logging` (DEC-127). Do not use `@bioeksen/sdk`.
- Do not change `.claude/skills/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
