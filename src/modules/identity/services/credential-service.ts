/**
 * Invitations and password resets (ACC-10, ACC-11, DEC-123, DEC-129).
 *
 * A link works once. An invitation works for 14 days and a reset for 1 hour. A
 * link that was used or ended is 401 `AUTH-4101`, and a link that is too old is
 * 401 `AUTH-4102`. The token check comes before the check of the password, so a
 * caller with a bad link learns nothing about the rules. The answer never says
 * which person owns a link or an email address.
 */
import "server-only";

import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";
import { logger } from "@/lib/logging";
import type { PasswordResetRequestInput, SetPasswordInput } from "@/lib/schemas/identity";
import { type Transaction, readExecutor, runTransaction } from "@/lib/transaction";
import { queueMail } from "@/modules/platform/services/mail-service";

import { hashPassword, verifyPassword } from "../domain/password-hash";
import { PASSWORD_ISSUES, checkPassword } from "../domain/password-policy";
import { type TokenPurpose, markTokenUsed } from "../repositories/token-repository";
import { endSessionsOfUser } from "../repositories/session-repository";
import { type UserRow, findUserByEmail, findUserById, updatePassword } from "../repositories/user-repository";
import { normalizeEmail } from "./identity-views";
import { endAllUnusedTokens, issueToken, requireUsableToken } from "./token-service";

function passwordError(issues: readonly FieldIssue[]): AppError {
  return new AppError("VAL-4006", CODE_MEANINGS["VAL-4006"], { details: issues });
}

/**
 * The user of a link that works, locked for the transaction. An inactive
 * account has no working link.
 */
async function requireLinkUser(tx: Transaction, secret: string, purpose: TokenPurpose): Promise<{ tokenId: bigint; user: UserRow }> {
  const token = await requireUsableToken(tx, secret, purpose);
  const user = await findUserById(tx, token.userId, true);
  if (user === null || !user.isActive) {
    throw new AppError("AUTH-4101", CODE_MEANINGS["AUTH-4101"], { reason: "the account of the link is inactive" });
  }
  return { tokenId: token.id, user };
}

/**
 * Opens the account: sets the password of the person who holds a valid
 * invitation link. The link ends (ACC-10.AC3).
 *
 * @throws AppError `AUTH-4101` for a used or ended link; `AUTH-4102` for a link
 * older than 14 days; `VAL-4006` with each broken rule in `details` (ACC-10.AC5).
 */
export async function acceptInvitation(input: SetPasswordInput): Promise<void> {
  const userId = await runTransaction(async (tx) => {
    const { tokenId, user } = await requireLinkUser(tx, input.token, "INVITATION");
    if (user.passwordHash !== null) {
      // An invitation opens an account once. A link that is still unused after the
      // person set a password through a reset must not set it again.
      throw new AppError("AUTH-4101", CODE_MEANINGS["AUTH-4101"], { reason: "the account has a password already" });
    }
    const issues = checkPassword(input.password, user.email);
    if (issues.length > 0) {
      throw passwordError(issues);
    }
    const at = now();
    await updatePassword(tx, user.id, await hashPassword(input.password), at);
    await markTokenUsed(tx, tokenId, at);
    await endAllUnusedTokens(tx, user.id);
    return user.id;
  });
  logger.write({ severity: "INFO", type: "SECURITY", message: "password set from an invitation", tail: { sub: String(userId) } });
}

/**
 * Asks for a password reset. The answer is the same whether or not the email
 * address belongs to an active user, and a mail goes only to an active user
 * (ACC-11.AC1). The mail is sent without waiting for it, so the time of the
 * answer does not tell the two cases apart.
 */
export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
  const emailNormalized = normalizeEmail(input.email);
  const known = await findUserByEmail(readExecutor(), emailNormalized);
  if (known === null || !known.isActive) {
    logger.write({ severity: "INFO", type: "SECURITY", message: "password reset requested, no mail sent" });
    return;
  }
  await runTransaction(async (tx) => {
    // The state is read again under the lock: a deactivation in between gets no mail.
    const user = await findUserById(tx, known.id, true);
    if (user === null || !user.isActive) {
      return;
    }
    const token = await issueToken(tx, user.id, "PASSWORD_RESET", null);
    await queueMail(tx, { template: "passwordReset", to: user.email, language: user.preferredLanguage, token }, { detached: true });
  });
  logger.write({ severity: "INFO", type: "SECURITY", message: "password reset requested, mail queued", tail: { sub: String(known.id) } });
}

/**
 * Sets the new password of the person who holds a valid reset link. Each
 * session of the user ends (ACC-11.AC2).
 *
 * @throws AppError `AUTH-4102` for a link older than 1 hour; `AUTH-4101` for a
 * used link; `VAL-4006` for a password that breaks a rule, also when it is the
 * current password (ACC-11.AC5).
 */
export async function completePasswordReset(input: SetPasswordInput): Promise<void> {
  const userId = await runTransaction(async (tx) => {
    const { tokenId, user } = await requireLinkUser(tx, input.token, "PASSWORD_RESET");
    const issues = [...checkPassword(input.password, user.email)];
    if (user.passwordHash !== null && (await verifyPassword(input.password, user.passwordHash))) {
      issues.push({ field: "password", issue: PASSWORD_ISSUES.current });
    }
    if (issues.length > 0) {
      throw passwordError(issues);
    }
    const at = now();
    await updatePassword(tx, user.id, await hashPassword(input.password), at);
    await markTokenUsed(tx, tokenId, at);
    await endAllUnusedTokens(tx, user.id);
    // After the commit: a rollback must leave the sessions.
    tx.afterCommit(async () => {
      await endSessionsOfUser(String(user.id));
    });
    return user.id;
  });
  logger.write({ severity: "INFO", type: "SECURITY", message: "password reset completed", tail: { sub: String(userId) } });
}
