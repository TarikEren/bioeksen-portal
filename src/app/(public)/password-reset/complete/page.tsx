/**
 * The page where a person sets a new password from a reset link (ACC-11.AC2 to
 * AC5, DEC-138).
 *
 * A server component. The token is in the URL fragment `#token=`, which the
 * server never sees, so the shared client form reads it in the browser and sends
 * it in the body of `completePasswordResetAction`. The page needs no session.
 */
import type { Metadata } from "next";

import { completePasswordResetAction } from "@/app/_actions/identity";
import { failureLabels } from "@/app/_components/failure";
import { PageFrame } from "@/app/_components/page-frame";
import { SetPasswordForm } from "@/app/_components/set-password-form";
import { passwordIssueTexts } from "@/app/_lib/password-rules";
import { getRequestText } from "@/app/_lib/request";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.passwordReset.complete.title };
}

export default async function PasswordResetCompletePage() {
  const { text } = await getRequestText();
  const copy = text.passwordReset.complete;

  return (
    <PageFrame title={copy.title} description={copy.description}>
      <SetPasswordForm
        action={completePasswordResetAction}
        labels={{
          password: copy.password,
          hint: copy.passwordHint,
          submit: copy.submit,
          saving: text.common.saving,
          doneTitle: copy.doneTitle,
          doneBody: copy.doneBody,
          signIn: copy.signIn,
        }}
        failure={failureLabels(text, copy.errors, passwordIssueTexts(text))}
      />
    </PageFrame>
  );
}
