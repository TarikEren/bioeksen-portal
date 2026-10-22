/**
 * The page that asks for a password reset (ACC-11.AC1).
 *
 * A server component. The form shows the same message for every email address.
 * The page needs no session.
 */
import type { Metadata } from "next";

import { failureLabels } from "@/app/_components/failure";
import { PageFrame } from "@/app/_components/page-frame";
import { getRequestText } from "@/app/_lib/request";

import { PasswordResetRequestForm } from "./_components/password-reset-request-form";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.passwordReset.request.title };
}

export default async function PasswordResetPage() {
  const { text } = await getRequestText();
  const copy = text.passwordReset;

  return (
    <PageFrame title={copy.request.title} description={copy.request.description}>
      <PasswordResetRequestForm
        labels={{
          email: copy.request.email,
          submit: copy.request.submit,
          saving: text.common.saving,
          doneTitle: copy.request.doneTitle,
          doneBody: copy.request.doneBody,
          backToSignIn: copy.backToSignIn,
        }}
        failure={failureLabels(text)}
      />
    </PageFrame>
  );
}
