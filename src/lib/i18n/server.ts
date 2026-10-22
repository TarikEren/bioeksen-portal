/**
 * The language of a request, on the server (DEC-017, FND-08 rule 2).
 *
 * The cookie `bp_lang` keeps the choice of a person for 365 days. The layout
 * reads it with `getActiveLanguage()` and sets `<html lang>`. The preference of
 * a signed-in user has priority over the cookie; it comes with the sessions of
 * stage B1.
 */
import "server-only";

import { cookies } from "next/headers";

import { isPublicBaseUrlSecure } from "@/lib/config";

import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  type Language,
  resolveLanguage,
} from "./languages";

/**
 * The active language of the current request: the cookie when it holds a known
 * language, else Turkish. Reading the cookie makes the page dynamic, as the
 * nonce of the Content Security Policy needs (FND-07).
 */
export async function getActiveLanguage(userPreferred: Language | null = null): Promise<Language> {
  const store = await cookies();
  return resolveLanguage({ userPreferred, cookie: store.get(LANGUAGE_COOKIE)?.value ?? null });
}

/** Keeps the choice of a person in the cookie `bp_lang` for 365 days. */
export async function storeLanguage(language: Language): Promise<void> {
  const store = await cookies();
  store.set(LANGUAGE_COOKIE, language, {
    maxAge: LANGUAGE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: isPublicBaseUrlSecure(),
  });
}
