/**
 * The page that creates a user (ACC-10.AC1, AC2, `/backoffice/users/new`).
 *
 * A server component. A holder of `organization.users.manage` sees the form. The
 * service checks the permission again when the form submits, because hiding a
 * page is not authorization (`sds-nextjs-frontend` §2). The page gives the form
 * only the text it shows.
 */
import { Typography } from "@heroui/react";
import type { Metadata } from "next";

import { failureLabels } from "@/app/_components/failure";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";

import { ForbiddenNotice } from "../../_components/forbidden-notice";
import { CreateUserForm } from "./_components/create-user-form";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.users.create.title };
}

export default async function NewUserPage() {
  const session = await requireSession();
  const { language, text } = await getRequestText();

  if (!session.actor.permissions.has("organization.users.manage")) {
    return <ForbiddenNotice title={text.users.forbidden.title} body={text.users.forbidden.body} />;
  }

  const copy = text.users.create;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: text.users.title, href: "/backoffice/users" },
            { label: copy.title },
          ]}
        />
        <div className="flex flex-col gap-1">
          <Typography.Heading level={1} weight="semibold">
            {copy.title}
          </Typography.Heading>
          <Typography.Paragraph color="muted" size="sm">
            {copy.description}
          </Typography.Paragraph>
        </div>
      </div>
      <CreateUserForm
        defaultLanguage={language}
        labels={{
          email: copy.email,
          firstName: copy.firstName,
          lastName: copy.lastName,
          preferredLanguage: copy.preferredLanguage,
          languagePlaceholder: copy.languagePlaceholder,
          tr: text.common.language.tr,
          en: text.common.language.en,
          submit: copy.submit,
          saving: text.common.saving,
          cancel: copy.cancel,
        }}
        failure={failureLabels(text, text.users.errors)}
      />
    </div>
  );
}
