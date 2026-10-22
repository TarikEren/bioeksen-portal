# Git Workflow

## Branches

- `main` is always releasable. No direct pushes.
- Work happens on short-lived branches: `feat/`, `fix/`, `chore/`, `docs/`,
  `refactor/`, `test/`, followed by a short kebab-case description.
  Example: `feat/eifu-lot-override`.
- Rebase onto `main` before opening a pull request. Merge with a merge commit so
  the review boundary stays visible.

## Commits

Conventional Commits, in English (`localization.md`):

```
<type>(<scope>): <imperative summary>

<body: what changed and why, not how>

<footer: refs, breaking changes>
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`.
Scopes match domain names: `eifu`, `academy`, `catalog`, `iam`, `audit`, `infra`.

Rules:

- Imperative mood: "add", not "added".
- One logical change per commit. A migration belongs with the model change that
  needs it.
- Never write an AI attribution line into a commit message or into production
  code (`coding-standards.md`).
- A commit touching a controlled-content invariant states which invariant and why
  it still holds.

## Pull requests

Every PR states:

1. What changed, in behavioural terms.
2. Which invariants it touches, and why they still hold.
3. Migration impact, if any — and whether it is reversible.
4. Authorization impact: which permission gates the new surface.
5. Which `definition-of-done.md` items were evaluated, and which were not applicable.

A PR that changes a state transition, a permission, an error code or a field name
must update the corresponding file under `docs/engineering/` in the same PR.
Documentation drift is a review blocker.

## Required checks

`make verify-strict` must pass. That is what CI gates on: `make verify` with
the governance checks in `--strict`, where a warning is a failure.

## Migrations

- Never amend or rebase a migration that has been applied anywhere but a local
  machine (`database-migrations.md`).
- A branch that adds a migration is rebased, not merged, before landing — so
  migration ordering stays linear.
- Two branches adding migrations to the same app conflict by design. Resolve by
  regenerating, never by hand-editing dependency graphs.
