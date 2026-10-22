# Database and Migration Safety

Prisma Migrate against PostgreSQL. The safety rules did not change when the
backend did; they got harder, because Prisma cannot see most of what this
system's correctness rests on.

## Read every generated migration before applying it

Not a courtesy. `prisma migrate dev` reads a constraint it can introspect but
cannot express as drift, and emits a `DROP` for it. That has happened here: it
generated `DROP INDEX "roleassignment_unique_per_scope"` while adding unrelated
tables. It failed loudly only because an index backing a constraint cannot be
dropped alone — a plain partial unique index would have gone silently.

Where Prisma can name the object, declaring it in `schema.prisma` with the same
`map:` name stops the DROP. Where it cannot, the generated file is edited before
it is applied.

## Hand-write what Prisma cannot express

`CHECK`, partial unique indexes, `EXCLUDE USING gist`, and plpgsql triggers live
in their own migrations, named `*_constraints`. There are 73 such objects across
eight migrations and they are where the guarantees are:
`applicability_no_overlap_per_product` is what makes ambiguous e-IFU resolution
unreachable, and a laboratory receiving the wrong revision is what that
prevents.

`scripts/check_database_constraints.py` derives the expected set from the
migration SQL — creations minus drops, in order — and asks the database what it
actually has. `CONSTRAINT_MISSING` is never a false positive.

## Never amend an applied migration

Prisma records a checksum. Editing an applied file makes the database read as
drifted, and the fix is to restore the file rather than to reset anything. A
comment worth writing goes in `schema.prisma` or in the next migration.

## What a generated migration gets wrong

`migrate diff` produces the shape and not the safety. Two of its habits have
already produced statements that would fail or destroy data on a populated
database:

- **`SET NOT NULL` with no backfill.** It fails on the first NULL. Write the
  `UPDATE` first, in the same migration.
- **A type change with no `USING`.** `integer` to `varchar` needs one, and the
  generated statement omitted it.

A third is not a bug but a decision it cannot make: when a column's MEANING
changes, a cast asserts something the data does not carry. `CatalogNumber.format`
held a letter and became the format the letter is derived from; `L` was
ambiguous under the new model, so the column was dropped and re-added rather
than cast, and the migration says why.

## Review before writing

- Destructive operations: `DROP COLUMN`, `DROP TABLE`, dropping a constraint.
- Nullable to required.
- Defaults and backfills on large tables.
- Index creation and the locks it takes.
- Splitting schema and data migrations when that is safer.

**Never silently alter historical controlled-content identifiers.** A migration
that renormalises a stored LOT number, renumbers a course version or rewrites a
certificate serial has destroyed the record it was meant to preserve.

## Two rules with no exceptions

- **Never rewrite production migration history.** A released schema change is a
  new migration.
- **A lost constraint fails the build.** `prisma db push` would drop every
  hand-written object without a word, which is why it is not used here and why
  the check runs in CI with `--strict`.

## Tests get their own database

Per run, named with the process id, dropped on teardown — `testing.md` explains
why, and it was paid for. Every run opens by dropping its database `WITH
(FORCE)`, and with one shared name a second `vitest` pulls the first one's
database out from under it.
