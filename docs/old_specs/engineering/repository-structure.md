# Repository Structure

Use a monorepo.

Recommended shape:

```text
bioeksen-portal/
├── AGENTS.md            adapter for non-Claude agents
├── CLAUDE.md            adapter for Claude Code
├── README.md
├── Makefile             `make verify` is the gate
├── backend/             NestJS, TypeScript, ESM
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/  *_constraints hold what Prisma cannot express
│   ├── src/
│   │   ├── audit/  authentication/  authorization/  config/
│   │   ├── database/  documents/  eifu/  health/  http/
│   │   ├── observability/  seed/  training/
│   │   └── generated/   Prisma client, not hand-edited
│   └── test/
├── frontend/            React, Vite
│   ├── src/
│   │   ├── app/         routes
│   │   ├── features/    one directory per screen family
│   │   ├── i18n/  locales/  lib/  styles/
│   └── public/
├── docs/
│   ├── adr/             fixed platform decisions
│   └── engineering/     canonical rules
├── infra/docker/
├── scripts/             governance checks
└── .github/workflows/
```

A feature directory owns its screens, its API calls, its types and its CSS. A
screen that needs another feature's data imports its API function, never its
component's internals.

Keep AI adapter files short and point them to canonical engineering documentation.

The canonical engineering documentation lives in `docs/engineering/`. `CLAUDE.md` and `AGENTS.md` at the repository root are short adapters that point into it and must not restate policy.
