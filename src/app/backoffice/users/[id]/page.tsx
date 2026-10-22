/**
 * The page of one user (ACC-10 rule 5, ACC-31, `/backoffice/users/[id]` of the
 * stage B1 UI table).
 *
 * A server component that calls the services `getUser` and `listRoles` directly.
 * The id in the path is user input: an id that does not parse, and a user that
 * does not exist (`RES-4200`), are a missing page (`notFound`). It shows the
 * details and the active roles to a holder of `organization.users.view`. With
 * `organization.users.manage` it offers the account actions that fit the state of
 * the user, and with `iam.role.manage` it offers grant and revoke. For the own
 * account it offers neither deactivation nor a grant, and says why; the services
 * refuse both anyway (ACC-10.AC8, ACC-31.AC2). Showing a control is not
 * authorization (`sds-nextjs-frontend` §2). The role names come in the active
 * language (DEC-011), and a date goes through the project formatter (FND-08 rule
 * 4). The status is an icon and a text (DEC-019).
 */
import { Card, Chip, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { failureLabels } from "@/app/_components/failure";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { EntityId } from "@/lib/schemas/identity";
import { listRoles } from "@/modules/identity/services/role-service";
import { getUser } from "@/modules/identity/services/user-service";

import { ForbiddenNotice } from "../../_components/forbidden-notice";
import { StatusIcon } from "@/app/_components/status-icon";
import { RoleManager } from "./_components/role-manager";
import { UserActions } from "./_components/user-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.users.detail.title };
}

export default async function UserPage({ params }: PageProps<"/backoffice/users/[id]">) {
  const { id } = await params;
  if (!EntityId.safeParse(id).success) {
    notFound();
  }
  const session = await requireSession();
  const { language, text } = await getRequestText();

  if (!session.actor.permissions.has("organization.users.view")) {
    return <ForbiddenNotice title={text.users.forbidden.title} body={text.users.forbidden.body} />;
  }

  const user = await getUser(session.actor, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "RES-4200") {
      notFound();
    }
    throw error;
  });

  const canManageUsers = session.actor.permissions.has("organization.users.manage");
  const canManageRoles = session.actor.permissions.has("iam.role.manage");
  const isOwnAccount = user.id === session.user.id;
  const allRoles = canManageRoles ? await listRoles(session.actor) : [];

  const heldCodes = new Set(user.roles.map((assignment) => assignment.roleCode));
  const grantable =
    canManageRoles && !isOwnAccount && user.isActive
      ? allRoles
          .filter((role) => !heldCodes.has(role.code))
          .map((role) => ({ code: role.code, name: role.name[language] }))
      : null;
  // The server offers the actions that fit the state of the user (ACC-10.AC6 to AC8).
  const canReinvite = !user.hasPassword && user.isActive;
  const canDeactivate = user.isActive && !isOwnAccount;
  const fullName = `${user.firstName} ${user.lastName}`;
  const detail = text.users.detail;
  const labels = failureLabels(text, text.users.errors);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: text.users.title, href: "/backoffice/users" },
            { label: fullName },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Typography.Heading level={1} weight="semibold" className="min-w-0">
            {fullName}
          </Typography.Heading>
          <Chip size="sm" color="default" variant="secondary">
            <StatusIcon isActive={user.isActive} />
            <Chip.Label>{user.isActive ? text.users.status.active : text.users.status.inactive}</Chip.Label>
          </Chip>
        </div>
      </div>

      <Card>
        <Card.Content>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-muted">{detail.email}</dt>
            <dd className="min-w-0 break-words">{user.email}</dd>
            <dt className="text-muted">{detail.language}</dt>
            <dd>
              <span lang={user.preferredLanguage}>{text.common.language[user.preferredLanguage]}</span>
            </dd>
            <dt className="text-muted">{detail.password}</dt>
            <dd>{user.hasPassword ? detail.passwordSet : detail.passwordNotSet}</dd>
            <dt className="text-muted">{detail.created}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date(user.createdAt), language)}</dd>
            <dt className="text-muted">{detail.updated}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date(user.updatedAt), language)}</dd>
          </dl>
        </Card.Content>
      </Card>

      {canManageUsers ? (
        <section aria-labelledby="actions-title" className="flex flex-col gap-3">
          <Typography.Heading level={2} weight="semibold" id="actions-title">
            {detail.actionsTitle}
          </Typography.Heading>
          <Card>
            <Card.Content className="flex flex-col gap-4">
              {isOwnAccount ? (
                <Typography.Paragraph color="muted" size="sm">
                  {detail.ownAccount}
                </Typography.Paragraph>
              ) : null}
              <UserActions
                userId={user.id}
                canReinvite={canReinvite}
                canDeactivate={canDeactivate}
                emptyText={isOwnAccount ? null : detail.noActions}
                labels={{
                  reinvite: detail.reinvite.button,
                  reinviteDone: detail.reinvite.done,
                  deactivate: detail.deactivate.button,
                  confirmTitle: detail.deactivate.confirmTitle,
                  confirmBody: detail.deactivate.confirmBody,
                  confirm: detail.deactivate.confirm,
                  cancel: detail.deactivate.cancel,
                  deactivateDone: detail.deactivate.done,
                }}
                failure={labels}
              />
            </Card.Content>
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="roles-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="roles-title">
          {text.roles.title}
        </Typography.Heading>
        <Card>
          <Card.Content>
            <RoleManager
              userId={user.id}
              roles={user.roles.map((assignment) => ({
                id: assignment.id,
                code: assignment.roleCode,
                name: assignment.roleName[language],
                grantedAt: formatDateTime(new Date(assignment.grantedAt), language),
              }))}
              canRevoke={canManageRoles}
              grantable={grantable}
              labels={{
                list: text.roles.list,
                none: text.roles.none,
                revoke: text.roles.revoke,
                revokeLabel: text.roles.revokeLabel,
                revokeDone: text.roles.revokeDone,
                grantLabel: text.roles.grant.label,
                grantPlaceholder: text.roles.grant.placeholder,
                grantSubmit: text.roles.grant.submit,
                grantNothing: text.roles.grant.nothingToGrant,
                grantDone: text.roles.grant.done,
                grantedAt: text.roles.grantedAt,
              }}
              failure={failureLabels(text, text.roles.errors)}
            />
          </Card.Content>
        </Card>
      </section>
    </div>
  );
}
