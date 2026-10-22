/**
 * The page "the account has no area yet" (ACC-50.AC2).
 *
 * A server component. A user who holds no permission reaches it after sign-in,
 * and it offers sign-out. A person with no session goes to `/sign-in`. A user who
 * holds a permission goes to the backoffice, so the page never tells a user with
 * an area that the account has none. The sign-out button is a client component
 * that gets only its text.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { failureLabels } from "@/app/_components/failure";
import { PageFrame } from "@/app/_components/page-frame";
import { SignOutButton } from "@/app/_components/sign-out-button";
import { landingPathFor } from "@/app/_lib/landing";
import { getRequestText, requireSession } from "@/app/_lib/request";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.noArea.title };
}

export default async function NoAreaPage() {
  const session = await requireSession();
  if (landingPathFor(session.user.permissions) === "/backoffice") {
    redirect("/backoffice");
  }
  const { text } = await getRequestText();

  return (
    <PageFrame title={text.noArea.title} description={text.noArea.body}>
      <SignOutButton label={text.common.signOut} failure={failureLabels(text)} />
    </PageFrame>
  );
}
