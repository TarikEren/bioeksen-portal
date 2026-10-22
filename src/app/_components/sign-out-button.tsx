"use client";

/**
 * The sign-out button of the page "no area yet" (ACC-50.AC2, ACC-20 rule 4).
 *
 * It is a HeroUI `Button` that calls `signOutAction` through `useSignOut`. The
 * props hold only the text the control shows. A failure shows the localized
 * sentence for its code with the code beside it (DEC-122).
 */
import { Button } from "@heroui/react";

import { FailureAlert } from "./failure-alert";
import type { FailureLabels } from "./failure";
import { useSignOut } from "./use-sign-out";

interface SignOutButtonProps {
  readonly label: string;
  readonly failure: FailureLabels;
}

export function SignOutButton({ label, failure: failureLabels }: SignOutButtonProps) {
  const { signOut, pending, failure } = useSignOut();

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      {failure === null ? null : <FailureAlert failure={failure} labels={failureLabels} />}
      <div>
        <Button variant="primary" isDisabled={pending} onPress={signOut}>
          {label}
        </Button>
      </div>
    </div>
  );
}
