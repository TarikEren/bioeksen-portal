/**
 * The password rules of DEC-028 (ACC-10.AC5).
 *
 * A password has 15 to 128 characters. It does not hold the email address of
 * the account. It is not on the common-password list (DEC-137). There are no
 * composition rules.
 *
 * This file is pure. `check` returns each rule that the password breaks, so
 * `details` of the answer can name all of them.
 */
import type { FieldIssue } from "@/lib/errors";
import { PASSWORD_MAX_LENGTH } from "@/lib/schemas/identity";

import { COMMON_PASSWORDS } from "./common-passwords";

export const PASSWORD_MIN_LENGTH = 15;

/** The fixed phrases of `details`. They never quote the password. */
export const PASSWORD_ISSUES = {
  tooShort: "has fewer than 15 characters",
  tooLong: "has more than 128 characters",
  holdsEmail: "holds the email address of the account",
  common: "is on the common-password list",
  current: "is the current password",
} as const;

/**
 * The rules that a password breaks, in the order of the list above.
 *
 * @param password The new password.
 * @param email The email address of the account.
 */
export function checkPassword(password: string, email: string): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    issues.push({ field: "password", issue: PASSWORD_ISSUES.tooShort });
  }
  if (length > PASSWORD_MAX_LENGTH) {
    issues.push({ field: "password", issue: PASSWORD_ISSUES.tooLong });
  }
  if (password.toLowerCase().includes(email.trim().toLowerCase())) {
    issues.push({ field: "password", issue: PASSWORD_ISSUES.holdsEmail });
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    issues.push({ field: "password", issue: PASSWORD_ISSUES.common });
  }
  return issues;
}
