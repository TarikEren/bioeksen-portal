# Technology Stack and Version Baseline

The single source of truth for runtime and framework versions. Do not introduce
a different version in a manifest without updating this file and recording the
reason in an ADR.

## Runtime baseline

| Component | Pinned version | Rationale |
|---|---|---|
| Node.js | 26 | The production runtime, not only a build tool (ADR-0015). |
| TypeScript | 6.x (backend), 5.x (frontend), `strict: true` | Required by `coding-standards.md`. The two differ because the frontend's toolchain has not caught up; that is a fact rather than a decision. |
| NestJS | 12.x | **ESM-only.** The backend is ESM throughout — `"type": "module"`, `nodenext` resolution, `.js` extensions on relative imports. This is not a preference and cannot be opted out of. |
| Prisma | 7.x | Driver adapters; no `url` in the datasource block, which lives in `prisma.config.ts`. See `database-migrations.md` for what Prisma cannot express. |
| zod | 4.x | Request bodies and every authored-configuration registry. |
| PostgreSQL | 16 | Required for the constraint features this project relies on: `EXCLUDE USING gist`, `UNIQUE NULLS NOT DISTINCT`, partial unique indexes. |
| Redis | 7.x | Sessions and the rate limiter. |
| MinIO | S3-compatible | Object storage in development; see `object-storage.md`. |
| React | 19.x | Fixed platform decision. |
| Vite | 7.x | SPA build tool; ADR-0004. |
| Vitest | 4.x (backend), 3.x (frontend) | One runner across the repository. **It does not type-check** — `tsc --noEmit` runs separately in `make verify`, and has caught what a green suite did not. |
| Python | >= 3.12 | The governance scripts in `scripts/` only. There is no Python application. |

## Dependency management

- Backend and frontend dependencies are declared in their own `package.json` and
  locked in `package-lock.json`.
- The governance scripts are declared in the root `pyproject.toml` and locked in
  `uv.lock` via [uv](https://docs.astral.sh/uv/).
- Lock files are committed. Reproducible builds are a traceability requirement,
  not a preference.
- Manifests use compatible ranges; lock files pin exact versions. Never
  hand-edit a lock file.

## Upgrade policy

- Security patches: apply promptly; no ADR required.
- Minor upgrades: allowed within the pinned major line after `make verify`
  passes.
- Major upgrades of Node, NestJS, Prisma, PostgreSQL or React: require an ADR.

Read `dependencies.md` before adding any new dependency.
