/**
 * What a page, a layout and its metadata read about the current request: the
 * session, and the dictionary of the active language (ACC-30.AC1, FND-08.AC5,
 * DEC-017).
 *
 * Each function is wrapped in React `cache`, so the root layout, a nested
 * layout, the page and `generateMetadata` of one request share one answer and
 * the session store is asked once. A client component never imports this file:
 * a server component reads the text and passes down only what the control shows
 * (`sds-nextjs-frontend` §2, §6).
 */
import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { type Dictionary, type Language, dictionaries } from "@/lib/i18n";
import { getActiveLanguage } from "@/lib/i18n/server";
import { type SessionUser, getCurrentSession } from "@/modules/identity/current-actor";

/** The actor and the user of the request, or `null` when the request has no live session. */
export const getSession = cache(async (): Promise<SessionUser | null> => getCurrentSession());

export interface RequestText {
  readonly language: Language;
  readonly text: Dictionary;
}

/**
 * The active language and its dictionary. The preferred language of a signed-in
 * user has priority over the cookie `bp_lang` (FND-08.AC5, DEC-017).
 */
export const getRequestText = cache(async (): Promise<RequestText> => {
  const session = await getSession();
  const language = await getActiveLanguage(session === null ? null : session.user.preferredLanguage);
  return { language, text: dictionaries[language] };
});

/**
 * The session of the request. A person with no live session goes to the sign-in
 * page (ACC-30 rule 2). A layout does not run again on each navigation inside it,
 * so each page of the backoffice calls this too. The services still check the
 * permission with the data (`sds-nextjs-backend` §3).
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (session === null) {
    redirect("/sign-in");
  }
  return session;
}
