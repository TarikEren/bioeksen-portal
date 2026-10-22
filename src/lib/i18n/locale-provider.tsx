"use client";

/**
 * The locale provider of the interface (FND-08 rule 2, DEC-017,
 * `sds-nextjs-frontend` §5).
 *
 * The root layout renders it once, with the active language of the request. It
 * does two jobs. It gives client components the active language
 * (`useLanguage`). It gives the `I18nProvider` of HeroUI (React Aria) the same
 * locale, so that the server and the browser format numbers and dates alike
 * and a HeroUI part with built-in text speaks the language of the page. React
 * Aria otherwise reads the locale from the browser on the client and uses
 * `en-US` on the server (R-023). The dictionary is not in the context: a
 * server component reads it and gives a client component only the text it
 * shows (`sds-nextjs-frontend` §2).
 */
import { I18nProvider } from "@heroui/react";
import { createContext, type ReactNode, use } from "react";

import type { Language } from "./languages";

const LanguageContext = createContext<Language | null>(null);

interface LocaleProviderProps {
  /** The active language of the request. */
  readonly language: Language;
  readonly children: ReactNode;
}

export function LocaleProvider({ language, children }: LocaleProviderProps) {
  return (
    <LanguageContext value={language}>
      <I18nProvider locale={language}>{children}</I18nProvider>
    </LanguageContext>
  );
}

/**
 * The active language, in a client component.
 *
 * @throws Error when no `LocaleProvider` is above the component. The root
 * layout renders one, so this is a defect of a test or of a new root.
 */
export function useLanguage(): Language {
  const language = use(LanguageContext);
  if (language === null) {
    throw new Error("useLanguage needs a LocaleProvider above the component.");
  }
  return language;
}
