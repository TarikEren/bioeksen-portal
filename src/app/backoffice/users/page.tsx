/**
 * The user list (ACC-10 rule 5, `/backoffice/users` of the stage B1 UI table).
 *
 * A server component that calls the service `listUsers` directly. A holder of
 * `organization.users.view` sees the list. "New user" shows with
 * `organization.users.manage`, as a GET form around a submit `Button`, because
 * `Button` has no `href`. The page number is in the URL (`?page=`), so a link
 * opens the same view; a value that does not parse is a missing page
 * (`notFound`). The table goes through a client wrapper that takes data. The
 * status of a user is an icon and a text, never a color alone (DEC-019). A date
 * goes through the project formatter (FND-08 rule 4).
 */
import { Button, Card, Chip, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { type UserListQuery, parseUserListQuery } from "@/lib/schemas/identity";
import { listUsers } from "@/modules/identity/services/user-service";

import { ForbiddenNotice } from "../_components/forbidden-notice";
import { StatusIcon } from "./_components/status-icon";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.users.title };
}

/** Reads `?page=` into the list query. A value that does not parse is a missing page. */
function readListQuery(page: string | string[] | undefined): UserListQuery {
  const params = new URLSearchParams();
  if (typeof page === "string") {
    params.set("page", page);
  }
  try {
    return parseUserListQuery(params);
  } catch (error) {
    if (error instanceof AppError) {
      notFound();
    }
    throw error;
  }
}

export default async function UsersPage({ searchParams }: PageProps<"/backoffice/users">) {
  const session = await requireSession();
  const { language, text } = await getRequestText();
  const query = readListQuery((await searchParams).page);

  if (!session.actor.permissions.has("organization.users.view")) {
    return <ForbiddenNotice title={text.users.forbidden.title} body={text.users.forbidden.body} />;
  }

  const result = await listUsers(session.actor, query);
  const canManage = session.actor.permissions.has("organization.users.manage");

  const columns: DataTableColumn[] = [
    { key: "name", label: text.users.columns.name, isRowHeader: true },
    { key: "email", label: text.users.columns.email },
    { key: "language", label: text.users.columns.language },
    { key: "status", label: text.users.columns.status },
    { key: "created", label: text.users.columns.created, cellClassName: "tabular-nums" },
  ];
  const rows: DataTableRow[] = result.users.map((user) => ({
    id: user.id,
    href: `/backoffice/users/${user.id}`,
    cells: {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      language: <span lang={user.preferredLanguage}>{text.common.language[user.preferredLanguage]}</span>,
      status: (
        <Chip size="sm" color="default" variant="secondary">
          <StatusIcon isActive={user.isActive} />
          <Chip.Label>{user.isActive ? text.users.status.active : text.users.status.inactive}</Chip.Label>
        </Chip>
      ),
      created: formatDateTime(new Date(user.createdAt), language),
    },
  }));

  const hasPrevious = result.page > 1;
  const hasNext = result.page * query.limit < result.totalCount;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[{ label: text.backoffice.nav.home, href: "/backoffice" }, { label: text.users.title }]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Typography.Heading level={1} weight="semibold">
              {text.users.title}
            </Typography.Heading>
            <Typography.Paragraph color="muted" size="sm">
              {fmt(text.users.summary, { count: result.totalCount })}
            </Typography.Paragraph>
          </div>
          {canManage ? (
            <form action="/backoffice/users/new" method="get">
              <Button type="submit" variant="primary">
                {text.users.newUser}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card variant="transparent">
          <Card.Content>
            <Typography.Paragraph color="muted" size="sm">
              {text.users.empty}
            </Typography.Paragraph>
          </Card.Content>
        </Card>
      ) : (
        <DataTable ariaLabel={text.users.table} columns={columns} rows={rows} className="min-w-[720px]" />
      )}

      {hasPrevious || hasNext ? (
        <nav aria-label={text.users.pagination.label} className="flex flex-wrap items-center gap-4">
          {hasPrevious ? (
            <AppLink href={`/backoffice/users?page=${result.page - 1}`}>{text.users.pagination.previous}</AppLink>
          ) : null}
          <Typography.Paragraph color="muted" size="sm">
            {fmt(text.users.pagination.page, { page: result.page })}
          </Typography.Paragraph>
          {hasNext ? (
            <AppLink href={`/backoffice/users?page=${result.page + 1}`}>{text.users.pagination.next}</AppLink>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
