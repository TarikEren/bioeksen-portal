/**
 * The common-password list of DEC-028 and DEC-137.
 *
 * DEC-137 says the list is a file of the repository with the entries of 15
 * characters or more of a public list. The entries are lower case; a check
 * compares the password in lower case.
 */

// MOCK: DEC-137
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "passwordpassword",
  "password1234567",
  "password12345678",
  "123456789012345",
  "1234567890123456",
  "qwertyuiopasdfgh",
  "qwertyuiop12345",
  "iloveyouiloveyou",
  "administrator123",
  "welcometobioeksen",
  "bioeksen12345678",
  "changemechangeme",
  "letmeinletmein123",
  "abcdefghijklmnop",
  "11111111111111111",
]);
