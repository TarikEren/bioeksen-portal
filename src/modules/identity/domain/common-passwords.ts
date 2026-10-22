/**
 * The common-password check of DEC-028 and DEC-137.
 *
 * The list is a file of the repository, `common-passwords-list.ts`, made by
 * `src/scripts/build-common-passwords.ts` from a published list. It holds the
 * entries of 15 characters or more, in lower case. A check compares the
 * password in lower case.
 */
import { COMMON_PASSWORD_ENTRIES } from "./common-passwords-list";

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(COMMON_PASSWORD_ENTRIES);
