/**
 * The public entry page (FND-08, FND-09), a placeholder of stage B0.
 *
 * It shows the heading `home.title` and the language switch. The server
 * component reads the dictionary of the active language and gives the switch
 * only the text it shows, so that no other text reaches the browser. The page
 * is dynamic because it reads the language cookie (see the root layout).
 */
import { Typography } from "@heroui/react";

import { dictionaries } from "@/lib/i18n";
import { getActiveLanguage } from "@/lib/i18n/server";

import { LanguageSwitch } from "./_components/language-switch";

export default async function PublicHomePage() {
  const language = await getActiveLanguage();
  const text = dictionaries[language];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Typography.Heading level={1} weight="semibold" className="min-w-0">
          {text.home.title}
        </Typography.Heading>
        <LanguageSwitch
          current={language}
          labels={{
            switch: text.common.language.switch,
            tr: text.common.language.tr,
            en: text.common.language.en,
            failure: text.common.language.failure,
            errorCode: text.common.errorCode,
          }}
        />
      </div>
    </main>
  );
}
