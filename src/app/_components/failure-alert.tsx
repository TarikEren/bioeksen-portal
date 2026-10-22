/**
 * The alert of a failed call (DEC-122, DEC-019, `sds-nextjs-frontend` §7 Forms
 * rule 10).
 *
 * It is a composition of HeroUI's `Alert` with text from the dictionary: the
 * title is the localized sentence for the code and the description holds the
 * code, so a state is never shown by color alone (an icon and a text). It never
 * shows the `message` of the answer. `role="alert"` makes a screen reader read
 * it at once, because HeroUI's `Alert` sets no role itself. A call with no
 * envelope shows the localized text of a failed call and no code.
 */
import { Alert } from "@heroui/react";

import { fmt, textForCode } from "@/lib/i18n/messages";

import type { FailureLabels, FailureView } from "./failure";

interface FailureAlertProps {
  readonly failure: FailureView;
  readonly labels: FailureLabels;
}

export function FailureAlert({ failure, labels }: FailureAlertProps) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator />
      <Alert.Content>
        {failure.status === "no-answer" ? (
          <Alert.Title>{labels.callFailed}</Alert.Title>
        ) : (
          <>
            <Alert.Title>{textForCode(labels.errors, failure.code, labels.fallback)}</Alert.Title>
            <Alert.Description>{fmt(labels.errorCode, { code: failure.code })}</Alert.Description>
          </>
        )}
      </Alert.Content>
    </Alert>
  );
}
