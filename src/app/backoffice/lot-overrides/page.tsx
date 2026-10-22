/**
 * The list of LOT overrides (IFU-40 *Screens*, DEC-094, `/backoffice/lot-overrides`
 * of the stage B3 UI table, mockup `LotOverridePage`).
 *
 * A server component that calls the service `listOverrides` directly. A holder of
 * `eifu.document.view` sees the list: the active overrides first, then the ended
 * ones, each group newest first. Each row opens the page of its LOT, where the
 * override is created and ended (DEC-094), so this page has no form. The state
 * filter and the page number are in the URL; a value that does not parse is a
 * missing page (`notFound`). An override whose target version was withdrawn shows
 * the state of the version as a warning with a text (IFU-40 rule 5). A LOT number, a
 * catalog number, a document number and a revision label are in IBM Plex Mono
 * (DEC-016); a time goes through the project formatter (DEC-133). A state is an icon
 * and a text (DEC-019). The reason is record content, not copy. The table has no
 * minimum width, so it fits at 1024 px beside the sidebar: the catalog number sits
 * under the LOT number, in one column.
 */
import { Card, Chip, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { StatusIcon } from "@/app/_components/status-icon";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { ForbiddenNotice } from "@/app/backoffice/_components/forbidden-notice";
import { PaginationNav } from "@/app/backoffice/_components/pagination-nav";
import { VersionStatusChip } from "@/app/backoffice/_components/version-status-chip";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { type LotOverrideListQuery, parseLotOverrideListQuery } from "@/lib/schemas/eifu";
import { listOverrides } from "@/modules/eifu/services/override-service";

const BASE_PATH = "/backoffice/lot-overrides";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.eifu.overrides.title };
}

/** The query values of the view that are text, with an empty value left out. */
function textParams(searchParams: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const name of ["active", "page"]) {
    const value = searchParams[name];
    if (typeof value === "string" && value !== "") {
      params[name] = value;
    }
  }
  return params;
}

/** Reads the query of the view. A value that does not parse is a missing page. */
function readListQuery(params: Readonly<Record<string, string>>): LotOverrideListQuery {
  try {
    return parseLotOverrideListQuery(new URLSearchParams(params));
  } catch (error) {
    if (error instanceof AppError) {
      notFound();
    }
    throw error;
  }
}

export default async function LotOverridesPage({ searchParams }: PageProps<"/backoffice/lot-overrides">) {
  const session = await requireSession();
  const { language, text } = await getRequestText();
  const params = textParams(await searchParams);
  const query = readListQuery(params);
  const copy = text.eifu.overrides;

  if (!session.actor.permissions.has("eifu.document.view")) {
    return <ForbiddenNotice title={text.eifu.forbidden.title} body={text.eifu.forbidden.body} />;
  }

  const result = await listOverrides(session.actor, query);

  const columns: DataTableColumn[] = [
    { key: "lot", label: copy.columns.lot, isRowHeader: true },
    { key: "document", label: copy.columns.document },
    { key: "versionState", label: copy.columns.versionState },
    { key: "state", label: copy.columns.state },
    { key: "reason", label: copy.columns.reason, cellClassName: "break-words" },
  ];
  const rows: DataTableRow[] = result.overrides.map((override) => ({
    id: override.id,
    href: `/backoffice/catalog/lots/${override.lotId}`,
    cells: {
      lot: (
        <span className="flex flex-col">
          <span className="font-mono break-all">{override.lotNumber}</span>
          <span className="font-mono break-all text-muted">{override.catalogNumber}</span>
        </span>
      ),
      document: (
        <span className="flex flex-col">
          <span className="font-mono break-all">{override.documentNumber}</span>
          <span className="font-mono text-muted">{override.revision}</span>
        </span>
      ),
      versionState: <VersionStatusChip status={override.versionStatus} label={text.eifu.status[override.versionStatus]} />,
      state: (
        <span className="flex flex-col items-start gap-1">
          <Chip size="sm" color="default" variant="secondary">
            <StatusIcon isActive={override.isActive} />
            <Chip.Label>{override.isActive ? copy.state.active : copy.state.ended}</Chip.Label>
          </Chip>
          <span className="text-muted tabular-nums">{formatDateTime(new Date(override.createdAt), language)}</span>
        </span>
      ),
      reason: override.reason,
    },
  }));

  const viewParams = Object.fromEntries(Object.entries(params).filter(([name]) => name !== "page"));

  /** The URL of the view with another state filter. A new filter starts on page one. */
  const filterHref = (active: "true" | "false" | null): string => (active === null ? BASE_PATH : `${BASE_PATH}?active=${active}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[{ label: text.backoffice.nav.home, href: "/backoffice" }, { label: copy.title }]}
        />
        <div className="flex flex-col gap-1">
          <Typography.Heading level={1} weight="semibold">
            {copy.title}
          </Typography.Heading>
          <Typography.Paragraph color="muted" size="sm">
            {fmt(copy.summary, { count: result.totalCount })}
          </Typography.Paragraph>
          <Typography.Paragraph color="muted" size="sm">
            {copy.description}
          </Typography.Paragraph>
        </div>
      </div>

      <nav aria-label={copy.filter.label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <AppLink href={filterHref(null)} isCurrent={query.active === null}>
          {copy.filter.all}
        </AppLink>
        <AppLink href={filterHref("true")} isCurrent={query.active === true}>
          {copy.filter.active}
        </AppLink>
        <AppLink href={filterHref("false")} isCurrent={query.active === false}>
          {copy.filter.ended}
        </AppLink>
      </nav>

      {rows.length === 0 ? (
        <Card variant="transparent">
          <Card.Content>
            <Typography.Paragraph color="muted" size="sm">
              {copy.empty}
            </Typography.Paragraph>
          </Card.Content>
        </Card>
      ) : (
        <DataTable ariaLabel={copy.table} columns={columns} rows={rows} />
      )}

      <PaginationNav
        basePath={BASE_PATH}
        params={viewParams}
        name="page"
        page={result.page}
        limit={query.limit}
        totalCount={result.totalCount}
        labels={text.catalog.pagination}
      />
    </div>
  );
}
