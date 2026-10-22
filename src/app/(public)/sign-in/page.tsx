/**
 * The sign-in page (ACC-20, ACC-50, FND-09.AC4).
 *
 * A server component. It reads the dictionary of the active language and gives
 * the form only the text it shows (`sds-nextjs-frontend` §6). The page needs no
 * session. The form sends the person to the backoffice or to the page "no area
 * yet" after the sign-in.
 */
import type { Metadata } from "next";

import { PageFrame } from "@/app/_components/page-frame";
import { failureLabels } from "@/app/_components/failure";
import { getRequestText } from "@/app/_lib/request";

import { SignInForm } from "./_components/sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.signIn.title };
}

export default async function SignInPage() {
  const { text } = await getRequestText();

  return (
    <PageFrame title={text.signIn.title} description={text.signIn.description}>
      <SignInForm
        labels={{
          email: text.signIn.email,
          password: text.signIn.password,
          submit: text.signIn.submit,
          submitting: text.signIn.submitting,
          forgotPassword: text.signIn.forgotPassword,
        }}
        failure={failureLabels(text, text.signIn.errors)}
      />
    </PageFrame>
  );
}
