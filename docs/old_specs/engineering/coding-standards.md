# Coding Standards

## Language

All source code and technical identifiers are English.

## TypeScript

The application, back and front.

- strict mode, and `exactOptionalPropertyTypes`: "absent" and "present but
  undefined" are different things and the compiler is told so;
- avoid `any`; prefer `unknown` and narrow it deliberately;
- explicit domain types, especially where a type is the guard — a function that
  cannot return an answer key is safer than one that remembers not to;
- validate external and server configuration at the boundary, with zod;
- `tsc --noEmit` is part of the gate. Vitest transforms with SWC and does not
  type-check.

## Python

The governance scripts in `scripts/` only. There is no Python application.

- clear names and type hints;
- keep functions cohesive;
- prefer explicit behaviour over hidden side effects;
- a check reports what it found and why it matters, never only a code.

## General

- no AI attribution comments in production code;
- no copy/pasted parallel domain implementations;
- no TODO without context/owner or rationale;
- no premature generic frameworks;
- no new dependency merely for convenience;
- a comment says **why**, and a comment that describes what the line already
  says is noise that will outlive the line;
- a comment that claims a branch is unreachable must be made true by something
  — a constraint, a type — or deleted.

Runtime versions: `tech-stack-versions.md`. Commit and branch conventions: `git-workflow.md`.
