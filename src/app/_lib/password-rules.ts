/**
 * The text of the password rules, for the pages that set a password (ACC-10.AC5,
 * ACC-11.AC5, DEC-122).
 *
 * The server names each broken rule in `details` with a fixed phrase
 * (`PASSWORD_ISSUES`). This function keys the localized sentence of each rule by
 * that phrase, so a rule that changes its phrase cannot silently lose its
 * sentence: the key is the constant, not a copy of the text. It runs on the
 * server, and the page gives the form the finished map.
 */
import "server-only";

import type { Dictionary } from "@/lib/i18n";
import { PASSWORD_ISSUES } from "@/modules/identity/domain/password-policy";

export function passwordIssueTexts(text: Dictionary): Readonly<Record<string, string>> {
  const rules = text.common.passwordRules;
  return {
    [PASSWORD_ISSUES.tooShort]: rules.tooShort,
    [PASSWORD_ISSUES.tooLong]: rules.tooLong,
    [PASSWORD_ISSUES.holdsEmail]: rules.holdsEmail,
    [PASSWORD_ISSUES.common]: rules.common,
    [PASSWORD_ISSUES.current]: rules.current,
  };
}
