"use client";

/**
 * The language switch (FND-08.AC3, AC4, DEC-017), a HeroUI ToggleButtonGroup.
 *
 * It is a composition of HeroUI parts: one group with an accessible name
 * (`common.language.switch`) and one toggle button for each language. A choice
 * calls the server action `setLanguage`, which sets the cookie `bp_lang`, and
 * then refreshes the route so that the server renders the page in the chosen
 * language. A failure shows the localized sentence with the code beside it
 * (DEC-122), and never the `message` of the answer. The props hold only the
 * text and the language that the control shows (`sds-nextjs-frontend` §2).
 * The group stays enabled while the action runs, so that focus stays on the
 * button the person pressed; `aria-busy` tells a screen reader to wait.
 */
import { Alert, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setLanguage } from "@/app/_actions/language";
import { LANGUAGES, isLanguage, type Language } from "@/lib/i18n/languages";

interface LanguageSwitchProps {
  /** The active language. */
  readonly current: Language;
  readonly labels: {
    /** The accessible name of the control. */
    readonly switch: string;
    readonly tr: string;
    readonly en: string;
    /** The sentence for a failed change. */
    readonly failure: string;
    /** The word that comes before the code of a failure. */
    readonly errorCode: string;
  };
}

export function LanguageSwitch({ current, labels }: LanguageSwitchProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failureCode, setFailureCode] = useState<string | null>(null);

  function choose(keys: Set<Key>): void {
    const [chosen] = keys;
    if (pending || !isLanguage(chosen) || chosen === current) {
      return;
    }
    startTransition(async () => {
      const result = await setLanguage(chosen);
      if (result.status === "ok") {
        setFailureCode(null);
        router.refresh();
      } else {
        setFailureCode(result.code);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ToggleButtonGroup
        aria-label={labels.switch}
        aria-busy={pending}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[current]}
        onSelectionChange={choose}
      >
        {LANGUAGES.map((language, index) => (
          <ToggleButton key={language} id={language}>
            {index > 0 ? <ToggleButtonGroup.Separator /> : null}
            {labels[language]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {failureCode === null ? null : (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {labels.failure} {labels.errorCode}: {failureCode}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
