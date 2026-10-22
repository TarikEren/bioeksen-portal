"use client";

/**
 * The language switch (FND-08.AC3, AC4, DEC-017), a HeroUI ToggleButtonGroup.
 *
 * It is a composition of HeroUI parts: one group with an accessible name
 * (`common.language.switch`) and one toggle button for each language. A choice
 * calls the server action `setLanguage`, which sets the cookie `bp_lang`, and
 * then refreshes the route so that the server renders the page in the chosen
 * language. A failure shows the localized sentence with the code beside it
 * (DEC-122), and never the `message` of the answer. A call that gets no
 * envelope (the promise rejects: the network fails, or the action is unknown)
 * shows the localized text of a failed call with no code, so that the error
 * does not reach the error screen of Next.js (R-002). The props hold only the
 * text and the language that the control shows (`sds-nextjs-frontend` §2).
 * The group stays enabled while the action runs, so that focus stays on the
 * button the person pressed; `aria-busy` tells a screen reader to wait.
 */
import { Alert, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setLanguage } from "@/app/_actions/language";
import type { ActionResult, ErrorCode } from "@/lib/errors";
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
    /** The sentence for a call that got no envelope. It has no code. */
    readonly callFailed: string;
  };
}

/** What the person sees after a failed change: an envelope with a code, or a call with no envelope. */
type Failure = { readonly kind: "envelope"; readonly code: ErrorCode } | { readonly kind: "call" };

export function LanguageSwitch({ current, labels }: LanguageSwitchProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);

  function choose(keys: Set<Key>): void {
    const [chosen] = keys;
    if (pending || !isLanguage(chosen) || chosen === current) {
      return;
    }
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await setLanguage(chosen);
      } catch {
        // An error inside a transition goes to the nearest error boundary. The
        // reason is not shown: it is not copy, and it can leak detail.
        setFailure({ kind: "call" });
        return;
      }
      if (result.status === "ok") {
        setFailure(null);
        router.refresh();
      } else {
        setFailure({ kind: "envelope", code: result.code });
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
      {failure === null ? null : (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {failure.kind === "call" ? (
                labels.callFailed
              ) : (
                <>
                  {labels.failure} {labels.errorCode}: {failure.code}
                </>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
