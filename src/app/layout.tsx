/**
 * The root layout (FND-08 rule 2, FND-09 rule 2, DEC-016, DEC-017).
 *
 * `<html lang>` gives the active language: the cookie `bp_lang`, else Turkish
 * (the preference of a signed-in user comes with the sessions of stage B1).
 * Reading the cookie makes every page dynamic. This is on purpose: the Content
 * Security Policy has a nonce that is new for each answer (FND-07 rule 1), and
 * a prerendered page cannot carry it, so the browser would block its scripts.
 *
 * The faces of DEC-016 come from the `@fontsource` packages, so that the app
 * serves them from its own origin, in the weights 400, 500 and 600 and the
 * subsets `latin` and `latin-ext` (Turkish letters are in `latin-ext`).
 * `fonts.css` connects them to the font tokens.
 */
import type { Metadata } from "next";

import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-sans/latin-ext-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-ext-500.css";
import "@fontsource/ibm-plex-mono/latin-ext-600.css";

import "./globals.css";
import "./fonts.css";

import { dictionaries } from "@/lib/i18n";
import { getActiveLanguage } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const language = await getActiveLanguage();
  return { title: dictionaries[language].home.title };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const language = await getActiveLanguage();

  return (
    <html lang={language}>
      <body>{children}</body>
    </html>
  );
}
