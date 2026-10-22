/**
 * The table `identity_user` (ACC-10). It holds queries and nothing else. It
 * never decides who may do what, and it never deletes a row: the triggers of the
 * table refuse DELETE and TRUNCATE (DEC-010).
 *
 * A function takes an `Executor`: the transaction of the service, or the client
 * for a read that needs none.
 */
import "server-only";

import { and, or } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, getDb, toColumnInstant } from "@/lib/db";

/** One user as the services read it. A time is an instant, and an id is the `bigint` key. */
export interface UserRow {
  readonly id: bigint;
  readonly email: string;
  readonly emailNormalized: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredLanguage: "tr" | "en";
  readonly isActive: boolean;
  /** The `scrypt` hash. `null` until the person opens the invitation. It never leaves the module. */
  readonly passwordHash: string | null;
  readonly passwordChangedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewUser {
  readonly email: string;
  readonly emailNormalized: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredLanguage: "tr" | "en";
  readonly now: Date;
}

interface StoredUser {
  readonly id: bigint;
  readonly email: string;
  readonly emailNormalized: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredLanguage: string;
  readonly isActive: boolean;
  readonly passwordHash: string | null;
  readonly passwordChangedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The check constraint of the table keeps other values out. A value that is not known is a defect of the store. */
function toLanguage(value: string): "tr" | "en" {
  if (value === "tr" || value === "en") {
    return value;
  }
  throw new Error("The store holds a preferred language that is not in the closed set");
}

function toUserRow(row: StoredUser): UserRow {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.emailNormalized,
    firstName: row.firstName,
    lastName: row.lastName,
    preferredLanguage: toLanguage(row.preferredLanguage),
    isActive: row.isActive,
    passwordHash: row.passwordHash,
    passwordChangedAt: row.passwordChangedAt === null ? null : fromColumnInstant(row.passwordChangedAt),
    createdAt: fromColumnInstant(row.createdAt),
    updatedAt: fromColumnInstant(row.updatedAt),
  };
}

/**
 * The user with the id, or `null`. `lock` reads the row `FOR NO KEY UPDATE`, so
 * a check and the write that follow it see the same row (`sds-database` §5). The
 * lock does not block a write of a row that names the user (a token, an
 * assignment), as `FOR UPDATE` does. It needs a transaction.
 */
export async function findUserById(executor: Executor, id: bigint, lock = false): Promise<UserRow | null> {
  const users = executor.orm.public.IdentityUser.where({ id });
  const row = await (lock ? users.forNoKeyUpdate() : users).first();
  return row === null ? null : toUserRow(row);
}

/** The user whose normalized email address is `emailNormalized`, or `null`. */
export async function findUserByEmail(executor: Executor, emailNormalized: string, lock = false): Promise<UserRow | null> {
  const users = executor.orm.public.IdentityUser.where({ emailNormalized });
  const row = await (lock ? users.forNoKeyUpdate() : users).first();
  return row === null ? null : toUserRow(row);
}

/** Inserts a user with no password. A second row with the same normalized address fails with `23505`. */
export async function insertUser(executor: Executor, user: NewUser): Promise<UserRow> {
  const at = toColumnInstant(user.now);
  const row = await executor.orm.public.IdentityUser.create({
    email: user.email,
    emailNormalized: user.emailNormalized,
    firstName: user.firstName,
    lastName: user.lastName,
    preferredLanguage: user.preferredLanguage,
    isActive: true,
    passwordHash: null,
    passwordChangedAt: null,
    createdAt: at,
    updatedAt: at,
  });
  return toUserRow(row);
}

/** Stores the hash of a new password. */
export async function updatePassword(executor: Executor, id: bigint, passwordHash: string, now: Date): Promise<void> {
  const at = toColumnInstant(now);
  await executor.orm.public.IdentityUser.where({ id }).update({
    passwordHash,
    passwordChangedAt: at,
    updatedAt: at,
  });
}

/** Ends the account. The row stays (DEC-010). */
export async function markUserInactive(executor: Executor, id: bigint, now: Date): Promise<void> {
  await executor.orm.public.IdentityUser.where({ id }).update({ isActive: false, updatedAt: toColumnInstant(now) });
}

export interface UserPageQuery {
  readonly page: number;
  readonly limit: number;
  /** A search text for the email address and the names. `null` for none. */
  readonly search: string | null;
}

export interface UserPage {
  readonly rows: readonly UserRow[];
  readonly totalCount: number;
}

/** The characters that `LIKE` reads as a pattern. The backslash is the escape character of PostgreSQL. */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** One page of users in the order of the ids. The order is total, so two pages never swap rows. */
export async function listUsers(query: UserPageQuery): Promise<UserPage> {
  const users = getDb().orm.public.IdentityUser;
  const pattern = query.search === null ? null : `%${escapeLikePattern(query.search)}%`;
  const matching = pattern === null
    ? users.where((user) => user.id.gt(BigInt(0)))
    : users.where((user) =>
        or(user.email.ilike(pattern), user.firstName.ilike(pattern), user.lastName.ilike(pattern)),
      );
  const [totals, rows] = await Promise.all([
    matching.aggregate((aggregate) => ({ total: aggregate.count() })),
    matching
      .orderBy((user) => user.id.asc())
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .all(),
  ]);
  return { rows: rows.map(toUserRow), totalCount: totals.total };
}

/** The active users who hold the role with the id, through an active assignment (bootstrap, ACC-40 rule 2). */
export async function countActiveUsersWithRole(executor: Executor, roleId: bigint): Promise<number> {
  const totals = await executor.orm.public.IdentityUser.where((user) =>
    and(
      user.isActive.eq(true),
      user.assignments.some((assignment) => and(assignment.isActive.eq(true), assignment.roleId.eq(roleId))),
    ),
  ).aggregate((aggregate) => ({ total: aggregate.count() }));
  return totals.total;
}
