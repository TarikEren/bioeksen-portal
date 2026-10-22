/**
 * The language switch with its text, for a server component (FND-08.AC3, AC4).
 *
 * The switch is a client component. This server component reads the dictionary
 * of the active language and gives the switch only the text it shows, so that no
 * other text reaches the browser (`sds-nextjs-frontend` §2). A page, the
 * backoffice shell and the entry page render it, so each builds the labels in one
 * place.
 */
import { getRequestText } from "../_lib/request";
import { LanguageSwitch } from "./language-switch";

export async function LanguageControl() {
  const { language, text } = await getRequestText();

  return (
    <LanguageSwitch
      current={language}
      labels={{
        switch: text.common.language.switch,
        tr: text.common.language.tr,
        en: text.common.language.en,
        failure: text.common.language.failure,
        errorCode: text.common.errorCode,
        errors: text.common.errors,
        callFailed: text.common.callFailed,
      }}
    />
  );
}
