/**
 * The links of the module: the invitation and the password reset (ACC-10,
 * ACC-11, DEC-123).
 *
 * A link works once. A new link for the same user and purpose ends the earlier
 * one (ACC-10.AC6). The table keeps only the SHA-256 of the token, so the clear
 * token exists in the mail and nowhere else.
 */
import "server-only";

import { now } from "@/lib/clock";
import type { Transaction } from "@/lib/transaction";
import { AppError, CODE_MEANINGS } from "@/lib/errors";

import { INVITATION_TTL_MS, PASSWORD_RESET_TTL_MS, hashSecret, randomSecret } from "../domain/tokens";
import {
  type TokenPurpose,
  type TokenRow,
  endUnusedTokens,
  findTokenByHash,
  insertToken,
} from "../repositories/token-repository";

const TTL_MS: Readonly<Record<TokenPurpose, number>> = {
  INVITATION: INVITATION_TTL_MS,
  PASSWORD_RESET: PASSWORD_RESET_TTL_MS,
};

/**
 * Makes a new link for a user. The earlier unused link of the same purpose ends
 * first, in the same transaction.
 *
 * @param createdByUserId The user who asked for it. `null` for the bootstrap command and for a person who asks for a reset.
 * @returns The token in clear text. It goes into the mail and nowhere else.
 */
export async function issueToken(
  tx: Transaction,
  userId: bigint,
  purpose: TokenPurpose,
  createdByUserId: bigint | null,
): Promise<string> {
  const at = now();
  await endUnusedTokens(tx, userId, purpose, at);
  const secret = randomSecret();
  await insertToken(tx, {
    userId,
    purpose,
    tokenHash: hashSecret(secret),
    expiresAt: new Date(at.getTime() + TTL_MS[purpose]),
    createdByUserId,
    now: at,
  });
  return secret;
}

/** Ends each unused link of the user, for every purpose. A password that was set makes them useless. */
export async function endAllUnusedTokens(tx: Transaction, userId: bigint): Promise<void> {
  const at = now();
  await endUnusedTokens(tx, userId, "INVITATION", at);
  await endUnusedTokens(tx, userId, "PASSWORD_RESET", at);
}

/**
 * The row of a link that works, locked for the transaction.
 *
 * A link that is unknown, used or ended is 401 `AUTH-4101`. A link that is too
 * old is 401 `AUTH-4102`. The answer never says whose link it is (ACC-10.AC3,
 * AC4, ACC-11.AC3, AC4).
 *
 * @throws AppError `AUTH-4101`, `AUTH-4102`.
 */
export async function requireUsableToken(tx: Transaction, secret: string, purpose: TokenPurpose): Promise<TokenRow> {
  const token = await findTokenByHash(tx, hashSecret(secret), purpose, true);
  if (token === null || token.usedAt !== null || token.endedAt !== null) {
    throw new AppError("AUTH-4101", CODE_MEANINGS["AUTH-4101"], { reason: "the link is unknown, used or ended" });
  }
  if (token.expiresAt.getTime() <= now().getTime()) {
    throw new AppError("AUTH-4102", CODE_MEANINGS["AUTH-4102"], { reason: "the link is too old" });
  }
  return token;
}
