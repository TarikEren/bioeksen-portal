# Dependency Policy

Before adding a dependency, evaluate:

- why it is needed;
- whether the current stack already solves the problem;
- active maintenance;
- license compatibility;
- security history;
- runtime and bundle impact;
- long-term ownership.

Prefer mature, maintained libraries. Do not add a micro-framework that
duplicates what NestJS, Prisma or React already do without a clear benefit.

## Where the manifests are

| Manifest | Governs |
|---|---|
| `backend/package.json` | The NestJS application. |
| `frontend/package.json` | The React SPA. |
| `pyproject.toml` (root) | The governance scripts in `scripts/`. There is no Python application. |

Pinned runtime and framework versions are in `tech-stack-versions.md`. A major
upgrade requires an ADR.

## Two constraints that are not preferences

**The backend is ESM.** NestJS 12 ships ESM-only, so a dependency that is
CommonJS-only either works through Node's interop or does not work at all.
Check before adding, not after.

**Prisma is the only ORM.** A second data-access library would be a second place
where a constraint the schema cannot express is invisible, and
`check_database_constraints.py` reads migrations rather than code.
