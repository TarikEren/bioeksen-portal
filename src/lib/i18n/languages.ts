/**
 * The languages of the interface and the choice of language (DEC-017, FND-08).
 *
 * Turkish is the default. The preferred language of a signed-in user has
 * priority. Otherwise, the language that the person chose last applies, and the
 * cookie `bp_lang` keeps it for 365 days.
 */
export const LANGUAGES = ["tr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "tr";

export const LANGUAGE_COOKIE = "bp_lang";
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export interface LanguageChoice {
  /** The preferred language of the signed-in user, `null` for a visitor (B1). */
  readonly userPreferred: Language | null;
  /** The value of the cookie `bp_lang`, `null` when absent. It is not validated yet. */
  readonly cookie: string | null;
}

/**
 * Returns the active language: the preference of the user, else a valid
 * cookie, else `DEFAULT_LANGUAGE`. A cookie with an unknown value is ignored
 * (FND-08.AC2 to AC5).
 */
export function resolveLanguage(choice: LanguageChoice): Language {
  if (choice.userPreferred !== null && isLanguage(choice.userPreferred)) {
    return choice.userPreferred;
  }
  if (isLanguage(choice.cookie)) {
    return choice.cookie;
  }
  return DEFAULT_LANGUAGE;
}
