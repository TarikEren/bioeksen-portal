/**
 * Signs the person out (ACC-20 rule 4, ACC-50.AC2).
 *
 * The user menu of the backoffice and the page "no area yet" both sign out, so
 * the call lives here once. On success the person goes to the sign-in page. A
 * request that finds no session (`AUTH-4100`) means that the session has ended
 * already, so the person is signed out and goes to the sign-in page too. Any
 * other failure stays on the page, with its localized text.
 */
import { useRouter } from "next/navigation";

import { signOutAction } from "@/app/_actions/identity";

import { failureOf, useActionOutcome } from "./use-action-outcome";

export function useSignOut() {
  const router = useRouter();
  const { state, submit, pending } = useActionOutcome<void>(async () => {
    const result = await signOutAction();
    if (result.status === "ok" || (result.status === "fail" && result.code === "AUTH-4100")) {
      router.replace("/sign-in");
    }
    return result;
  });

  return {
    signOut: (): void => submit(),
    pending,
    failure: failureOf(state.outcome),
  };
}
