# Claude Code tooling

What this project carries for Claude Code, what actually ran during the
TypeScript rebuild (2026-09-04 onwards), and where the standards it was built
against live.

Written as a record rather than a recommendation. If a skill is listed here as
unused, that is a fact about what happened, not advice to keep avoiding it.

## What is configured

| Where | What | Loaded |
|---|---|---|
| `CLAUDE.md` | Project adapter: invariants, registries, language rules | Automatically, every session |
| `AGENTS.md` | The same for non-Claude agents | Automatically, by agents that read it |
| `.claude/skills/bioeksen-portal-engineering/` | The engineering constitution | On request |
| `.claude/agents/` | Four review subagents | On request, or proactively per their descriptions |
| `.claude/commands/` | Four slash commands | When typed |
| `bioeksen-sds@bioeksen-skills` | The estate standards, as a plugin | See *The plugin problem* |

## Skills that ran during the rebuild

Three, all of them for the design work rather than the backend.

### `design`

Produced the Academy screen canvas — 16 artboards across three pages, published
as an Artifact. It is the one deliverable in this project that is not code or
prose.

Six of those screens now exist as code: the course list and detail, the Training
Studio content tree, the assessment authoring screen, and the learner's course
list, player and assessment. The canvas was accurate enough that building them
was mostly transcription.

What it changed about the work: the screens were built by lifting exact values
out of `tokens.css` and `backoffice.css` rather than by designing something new
that would then have to be reconciled. The class names in the artboards are the
product's own, which is why they read as a specification for
`features/academy/academy.css` rather than as pictures.

### `artifact-design`

Loaded before authoring the canvas. Its calibration step is what stopped the
screens becoming an editorial exercise: this is instrumentation for a
laboratory, and the existing design system already answered every question it
would otherwise have asked.

### `artifact-capabilities`

Loaded once, to read which runtime capabilities this account actually has before
declaring any. Without it the publish would have been a guess about what the
platform offers.

## Standards the backend was built against

`bioeksen-sds` — four cross-service standards owned by BioEksen Ar-Ge, in
<https://github.com/TarikEren/bioeksen-ai-skills>.

They were **read from the plugin source and followed by hand**, not invoked as
skills. See below for why.

| Standard | What it decided here |
|---|---|
| `sds-api-design` | `GET /api/health/live`, `/ready`, `/api/health`, `GET /api/admin/logs`, and the error envelope's shape. This project had **none** of the four endpoints. |
| `sds-logging` | The six-field log record, the closed 38-code list, the logfmt tail, per-request correlation. It replaced seven lines of guidance with a contract. |
| `sds-auth` | Operator credentials for the two estate-facing endpoints. It also scoped *itself* out of end-user endpoints, which is what left ADR-0003's session cookies untouched. |
| `sds-commit` | Conventional commits with a mandatory `Change-Id:` trailer. |

ADR-0014 records the one place they collide with this project's own registry,
and the deviation taken.

### The plugin problem

`bioeksen-sds@bioeksen-skills` is enabled in user settings, and at the start of
the rebuild its cache under `~/.claude/plugins/cache/` held only `plugin.json`.
The skill files were absent, so the skills never registered and never appeared
in the session's skill list. They were read directly from the marketplace
checkout instead:

```
~/.claude/plugins/marketplaces/bioeksen-skills/plugins/bioeksen-sds/skills/
```

The cache has since been populated, so a **new session should see them as
`sds-api-design`, `sds-auth`, `sds-logging` and `sds-commit`**. Worth confirming
before assuming: a standard that has to be found by hand is a standard that will
eventually be followed from memory.

That matters more now than it did. The estate contract is deliberately
language-agnostic — `sds-logging` closes by saying its bindings should split
into `sds-<language>` skills once a second language is in use, and this backend
is that second language.

## What did not run

Recorded so the list is not read as a complete account of what is available.

- **`bioeksen-portal-engineering`** was not invoked. `CLAUDE.md` loads
  automatically and carries the invariants that mattered day to day; the skill
  holds the fuller constitution. It was *edited* during the rebuild — its fixed
  decisions said Django — so it is current, but it was not consulted through the
  Skill tool.
- **The four review subagents** were not run. The project's instruction for this
  session was not to spawn agents unasked. `migration-safety-reviewer` was
  rewritten instead, because under Prisma its job is harder: nothing in the
  toolchain reports a lost constraint.
- **`/check-invariants`, `/adr`, `/review-dod`, `/new-domain-app`** were not
  invoked. `make check` and `make verify` were run directly and often;
  `/new-domain-app` was rewritten for NestJS.

## The checks that did run, constantly

Not skills, but they did more of the work than any skill did. See
[scripts/README.md](../../scripts/README.md).

| Check | What it caught |
|---|---|
| `check_database_constraints.py` | Written because Prisma cannot see the checks, partial indexes and triggers this system's safety rests on — 73 of them across eight hand-written migrations, and the count only goes up. Proved by dropping the e-IFU exclusion constraint and watching it exit 1. |
| `generate_domain_codes.py --check` | Keeps `domain-codes.ts` and `error-codes.md` from disagreeing. Writing it surfaced three wrong mappings. |
| `generate_permissions.py --check` | The same for the permission matrix: `permissions.ts` is generated from the tables in `permission-matrix.md`, so a code cannot be invented inline. It says nothing about tests — *"every permission needs a positive and a negative test"* is a rule review enforces, and `testing.md` now says so rather than implying a script does it. |
| `check_design_tokens.py` | Unchanged from before the rebuild; still the reason the token file is exempt from Prettier. |
| `validate_translations.py` | Its JSX-text pattern read `=>` and `>=` as element brackets, reporting `Promise` and `= 200 && status` as untranslated copy — nine warnings in a codebase with none. Narrowed to exclude operators and generics, and proved against a fixture that it still catches hardcoded Turkish, hardcoded English and a hardcoded `aria-label`. It has since caught a real one: two Turkish literals seeded into a true/false question form. |

## If you are picking this up

1. Confirm the `sds-*` skills load. If they do not, reinstall the plugin rather
   than reading the markdown by hand.
2. `make verify` is the gate. It runs lint, type-check, formatting, the
   governance checks and all three test suites.
3. Read `eifu-resolution-specification.md` before touching anything under
   `src/eifu`, `src/lots` or `src/documents`. It is normative, and it carries 21
   acceptance vectors and two recorded open questions.
4. Read `testing.md` before writing an end-to-end spec. Two of its rules were
   paid for by a flake that took an afternoon to find: a run gets its own
   database, and a spec listens once.
