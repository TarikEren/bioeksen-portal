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

import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";
import { now } from "@/lib/clock";
import { logger } from "@/lib/logging";
import {
  MOCK_PASSWORD,
  type MockToken,
  type MockTokenPurpose,
  type MockUser,
  endMockSessionsOfUser,
  findMockToken,
  issueMockToken,
} from "@/lib/mock/identity";
import { runMockTransaction } from "@/lib/mock/transaction";
import type { PasswordResetRequestInput, SetPasswordInput } from "@/lib/schemas/identity";
import { queueMail } from "@/modules/platform/services/mail-service";

import { PASSWORD_ISSUES, checkPassword } from "../domain/password-policy";
import { findUserByEmail, findUserById } from "./identity-views";

/** The token and the user of a link that works, or the refusal (ACC-10.AC3, AC4, ACC-11.AC3, AC4). */
function requireUsableToken(secret: string, purpose: MockTokenPurpose): { token: MockToken; user: MockUser } {
  const token = findMockToken(secret, purpose);
  if (token === null || token.usedAt !== null || token.endedAt !== null) {
    throw new AppError("AUTH-4101", CODE_MEANINGS["AUTH-4101"], { reason: "the link is unknown, used or ended" });
  }
  if (token.expiresAt.getTime() <= now().getTime()) {
    throw new AppError("AUTH-4102", CODE_MEANINGS["AUTH-4102"], { reason: "the link is too old" });
  }
  const user = findUserById(token.userId);
  if (user === null || !user.isActive) {
    throw new AppError("AUTH-4101", CODE_MEANINGS["AUTH-4101"], { reason: "the account of the link is inactive" });
  }
  return { token, user };
}

function passwordError(issues: readonly FieldIssue[]): AppError {
  return new AppError("VAL-4006", CODE_MEANINGS["VAL-4006"], { details: issues });
}

/**
 * Opens the account: sets the password of the person who holds a valid
 * invitation link. The link ends (ACC-10.AC3).
 *
 * @throws AppError `AUTH-4101` for a used or ended link; `AUTH-4102` for a link
 * older than 14 days; `VAL-4006` with each broken rule in `details` (ACC-10.AC5).
 */
// MOCK: ACC-10
export async function acceptInvitation(input: SetPasswordInput): Promise<void> {
  const { token, user } = requireUsableToken(input.token, "INVITATION");
  const issues = checkPassword(input.password, user.email);
  if (issues.length > 0) {
    return Promise.reject(passwordError(issues));
  }
  token.usedAt = now();
  user.hasPassword = true;
  user.updatedAt = now();
  logger.write({ severity: "INFO", type: "SECURITY", message: "password set from an invitation", tail: { sub: user.id } });
  return Promise.resolve();
}

/**
 * Asks for a password reset. The answer is the same whether or not the email
 * address belongs to an active user, and a mail goes only to an active user
 * (ACC-11.AC1).
 */
// MOCK: ACC-11
export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
  const user = findUserByEmail(input.email);
  if (user === null || !user.isActive) {
    logger.write({ severity: "INFO", type: "SECURITY", message: "password reset requested, no mail sent" });
    return;
  }
  await runMockTransaction(async (tx) => {
    const token = issueMockToken(user.id, "PASSWORD_RESET");
    await queueMail(tx, { template: "passwordReset", to: user.email, language: user.preferredLanguage, token });
  });
  logger.write({ severity: "INFO", type: "SECURITY", message: "password reset requested, mail queued", tail: { sub: user.id } });
}

/**
 * Sets the new password of the person who holds a valid reset link. Each
 * session of the user ends (ACC-11.AC2).
 *
 * @throws AppError `AUTH-4102` for a link older than 1 hour; `AUTH-4101` for a
 * used link; `VAL-4006` for a password that breaks a rule, also when it is the
 * current password (ACC-11.AC5).
 */
// MOCK: ACC-11
export async function completePasswordReset(input: SetPasswordInput): Promise<void> {
  const { token, user } = requireUsableToken(input.token, "PASSWORD_RESET");
  const issues = [...checkPassword(input.password, user.email)];
  if (user.hasPassword && input.password === MOCK_PASSWORD) {
    // In the mock, every account has the password of the mock as its current password.
    issues.push({ field: "password", issue: PASSWORD_ISSUES.current });
  }
  if (issues.length > 0) {
    return Promise.reject(passwordError(issues));
  }
  token.usedAt = now();
  user.hasPassword = true;
  user.updatedAt = now();
  endMockSessionsOfUser(user.id);
  logger.write({ severity: "INFO", type: "SECURITY", message: "password reset completed", tail: { sub: user.id } });
  return Promise.resolve();
}
