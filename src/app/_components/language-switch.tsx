"use client";

/**
 * The language switch (FND-08.AC3, AC4, DEC-017), a HeroUI ToggleButtonGroup.
 *
 * It is a composition of HeroUI parts: one group with an accessible name
 * (`common.language.switch`) and one toggle button for each language. A choice
 * calls the server action `setLanguage`, which sets the cookie `bp_lang`, and
 * then refreshes the route so that the server renders the page in the chosen
 * language. A failure shows the localized sentence for its code in the title
 * of the alert and the code in its description (DEC-122, R-017, R-024), and
 * never the `message` of the answer. The sentence comes from a map keyed by
 * code, and the sentence of the action is the fallback; the code part comes
 * from a template that `fmt` fills. A call that gets no
 * envelope (the promise rejects: the network fails, or the action is unknown)
 * shows the localized text of a failed call with no code, so that the error
 * does not reach the error screen of Next.js (R-002). The props hold only the
 * text and the language that the control shows (`sds-nextjs-frontend` §2).
 * The group stays enabled while the action runs, so that focus stays on the
 * button the person pressed. `aria-busy` is on the wrapping `div`, which React
 * renders as it is: the ToggleButtonGroup of React Aria keeps only global and
 * label props, so `aria-busy` on the group never reached the DOM (R-016). Each
 * language name is in a `span` with the `lang` of that language, so that a
 * screen reader speaks "English" with English rules on a Turkish page (R-018,
 * WCAG 3.1.2, DEC-018).
 */
import { Alert, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setLanguage } from "@/app/_actions/language";
import type { ActionResult, ErrorCode } from "@/lib/errors";
import { LANGUAGES, isLanguage, type Language } from "@/lib/i18n/languages";
import { fmt, textForCode } from "@/lib/i18n/messages";

interface LanguageSwitchProps {
  /** The active language. */
  readonly current: Language;
  readonly labels: {
    /** The accessible name of the control. */
    readonly switch: string;
    readonly tr: string;
    readonly en: string;
    /** The sentence for a failed change, when the map has no entry for the code. */
    readonly failure: string;
    /** The sentence for each code, by code. */
    readonly errors: Readonly<Record<string, string>>;
    /** The template of the code part of a failure. It names the placeholder `{code}`. */
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
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <ToggleButtonGroup
        aria-label={labels.switch}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[current]}
        onSelectionChange={choose}
      >
        {LANGUAGES.map((language, index) => (
          <ToggleButton key={language} id={language}>
            {index > 0 ? <ToggleButtonGroup.Separator /> : null}
            <span lang={language}>{labels[language]}</span>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {failure === null ? null : (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            {failure.kind === "call" ? (
              <Alert.Title>{labels.callFailed}</Alert.Title>
            ) : (
              <>
                <Alert.Title>{textForCode(labels.errors, failure.code, labels.failure)}</Alert.Title>
                <Alert.Description>{fmt(labels.errorCode, { code: failure.code })}</Alert.Description>
              </>
            )}
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
