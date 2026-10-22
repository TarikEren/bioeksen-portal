/**
 * The table `identity_auth_token` (ACC-10 rule 2, ACC-11, DEC-123): an
 * invitation link or a reset link. The table keeps the SHA-256 of the token and
 * never the token. A user has one unused token for each purpose: the partial
 * unique index `identity_auth_token_one_unused_unique` enforces it, so a new
 * token ends the earlier one first.
 */
import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";

export type TokenPurpose = "INVITATION" | "PASSWORD_RESET";

export interface TokenRow {
  readonly id: bigint;
  readonly userId: bigint;
  readonly purpose: TokenPurpose;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly endedAt: Date | null;
}

export interface NewToken {
  readonly userId: bigint;
  readonly purpose: TokenPurpose;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  /** The user who made the token. `null` for the bootstrap command (ACC-40). */
  readonly createdByUserId: bigint | null;
  readonly now: Date;
}

interface StoredToken {
  readonly id: bigint;
  readonly userId: bigint;
  readonly purpose: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly endedAt: string | null;
}

function toPurpose(value: string): TokenPurpose {
  if (value === "INVITATION" || value === "PASSWORD_RESET") {
    return value;
  }
  throw new Error("The store holds a token purpose that is not in the closed set");
}

function toTokenRow(row: StoredToken): TokenRow {
  return {
    id: row.id,
    userId: row.userId,
    purpose: toPurpose(row.purpose),
    expiresAt: fromColumnInstant(row.expiresAt),
    usedAt: row.usedAt === null ? null : fromColumnInstant(row.usedAt),
    endedAt: row.endedAt === null ? null : fromColumnInstant(row.endedAt),
  };
}

/**
 * Ends each unused token of the user and purpose (ACC-10.AC6, DEC-123). It runs
 * before a new token is inserted, in the same transaction.
 */
export async function endUnusedTokens(executor: Executor, userId: bigint, purpose: TokenPurpose, now: Date): Promise<void> {
  await executor.orm.public.IdentityAuthToken.where((token) =>
    and(token.userId.eq(userId), token.purpose.eq(purpose), token.usedAt.isNull(), token.endedAt.isNull()),
  ).updateAll({ endedAt: toColumnInstant(now) });
}

export async function insertToken(executor: Executor, token: NewToken): Promise<void> {
  await executor.orm.public.IdentityAuthToken.create({
    userId: token.userId,
    purpose: token.purpose,
    tokenHash: token.tokenHash,
    expiresAt: toColumnInstant(token.expiresAt),
    usedAt: null,
    endedAt: null,
    createdByUserId: token.createdByUserId,
    createdAt: toColumnInstant(token.now),
  });
}

/**
 * The token with the hash and the purpose, or `null`. `lock` reads the row
 * `FOR UPDATE`, so two uses of one link cannot both succeed (ACC-10.AC3).
 */
export async function findTokenByHash(
  executor: Executor,
  tokenHash: string,
  purpose: TokenPurpose,
  lock = false,
): Promise<TokenRow | null> {
  const tokens = executor.orm.public.IdentityAuthToken.where((token) =>
    and(token.tokenHash.eq(tokenHash), token.purpose.eq(purpose)),
  );
  const row = await (lock ? tokens.forUpdate() : tokens).first();
  return row === null ? null : toTokenRow(row);
}

export async function markTokenUsed(executor: Executor, id: bigint, now: Date): Promise<void> {
  await executor.orm.public.IdentityAuthToken.where({ id }).update({ usedAt: toColumnInstant(now) });
}
