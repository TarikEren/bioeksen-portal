/**
 * The list of LOT imports (CAT-60 rule 2, DEC-056, CAT-61,
 * `/backoffice/catalog/lot-imports` of the stage B2 UI table, mockup
 * `LotImportPage`).
 *
 * A server component that calls the service `listImports` directly. A holder of
 * `catalog.lot.view` sees the list with the status and the counts of each import,
 * a failed one included: it is recorded so that nobody assumes an import went
 * through that did not (CAT-60 rule 8). "New import" and the template download
 * show with `catalog.lot.manage` (DEC-057). The template is a download from the
 * route handler `GET /api/v1/catalog/lot-imports/template`, a plain link with a
 * full page load, because it is a file and not a page. The page number is in the
 * URL; a value that does not parse is a missing page (`notFound`). The status is
 * a chip with an icon and a text (DEC-019). The table has no minimum width, so
 * it fits at 1024 px beside the sidebar (R-063). A date goes through the project
 * formatter (DEC-133). The product of an import shows by its stem when the person
 * may view products.
 */
import { Card, Link, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppButtonLink } from "@/app/_components/app-button-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { type ImportListQuery, parseImportListQuery } from "@/lib/schemas/catalog";
import { MAX_LIMIT } from "@/lib/schemas/identity";
import { listImports } from "@/modules/catalog/services/lot-import-service";
import { listProducts } from "@/modules/catalog/services/product-service";

import { ForbiddenNotice } from "../../_components/forbidden-notice";
import { ImportStatusChip } from "../_components/import-status-chip";
import { PaginationNav } from "../_components/pagination-nav";

const BASE_PATH = "/backoffice/catalog/lot-imports";
const TEMPLATE_PATH = "/api/v1/catalog/lot-imports/template";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.catalog.imports.title };
}

/** Reads `?page=` into the list query. A value that does not parse is a missing page. */
function readListQuery(page: string | string[] | undefined): ImportListQuery {
  const params = new URLSearchParams();
  if (typeof page === "string") {
    params.set("page", page);
  }
  try {
    return parseImportListQuery(params);
  } catch (error) {
    if (error instanceof AppError) {
      notFound();
    }
    throw error;
  }
}

export default async function LotImportsPage({ searchParams }: PageProps<"/backoffice/catalog/lot-imports">) {
  const session = await requireSession();
  const { language, text } = await getRequestText();
  const query = readListQuery((await searchParams).page);
  const copy = text.catalog.imports;

  if (!session.actor.permissions.has("catalog.lot.view")) {
    return <ForbiddenNotice title={text.catalog.forbidden.title} body={text.catalog.forbidden.body} />;
  }

  const result = await listImports(session.actor, query);
  const canManage = session.actor.permissions.has("catalog.lot.manage");
  const stems = new Map<string, string>();
  if (session.actor.permissions.has("catalog.product.view")) {
    const products = await listProducts(session.actor, { page: 1, limit: MAX_LIMIT, q: null, active: null });
    for (const product of products.products) {
      stems.set(product.id, `${product.internalCode} ${text.catalog.regulatoryStatus[product.regulatoryStatus]}`);
    }
  }

  const columns: DataTableColumn[] = [
    { key: "when", label: copy.columns.when, isRowHeader: true, cellClassName: "tabular-nums" },
    { key: "source", label: copy.columns.source, cellClassName: "break-words" },
    { key: "status", label: copy.columns.status },
    { key: "rows", label: copy.columns.rows, cellClassName: "tabular-nums" },
    { key: "outcomes", label: copy.columns.outcomes, cellClassName: "tabular-nums" },
  ];
  const rows: DataTableRow[] = result.imports.map((lotImport) => {
    const productLabel = lotImport.productId === null ? copy.allProducts : (stems.get(lotImport.productId) ?? null);
    return {
      id: lotImport.id,
      href: `${BASE_PATH}/${lotImport.id}`,
      cells: {
        when: formatDateTime(new Date(lotImport.createdAt), language),
        source: (
          <div className="flex flex-col">
            <span>{lotImport.sourceFilename ?? copy.pasted}</span>
            {productLabel === null ? null : <span className="font-mono text-sm text-muted">{productLabel}</span>}
          </div>
        ),
        status: <ImportStatusChip status={lotImport.status} label={copy.status[lotImport.status]} />,
        rows: String(lotImport.rowCount),
        outcomes: (
          <ul className="text-sm">
            <li>
              {lotImport.createdCount} {copy.counts.created}
            </li>
            <li>
              {lotImport.existingCount} {copy.counts.existing}
            </li>
            <li>
              {lotImport.conflictCount} {copy.counts.conflict}
            </li>
            <li>
              {lotImport.invalidCount} {copy.counts.invalid}
            </li>
          </ul>
        ),
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[{ label: text.backoffice.nav.home, href: "/backoffice" }, { label: copy.title }]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Typography.Heading level={1} weight="semibold">
              {copy.title}
            </Typography.Heading>
            <Typography.Paragraph color="muted" size="sm">
              {fmt(copy.summary, { count: result.totalCount })}
            </Typography.Paragraph>
          </div>
          {canManage ? <AppButtonLink href={`${BASE_PATH}/new`}>{copy.newImport}</AppButtonLink> : null}
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href={TEMPLATE_PATH} download>
              {copy.template.link}
            </Link>
            <Typography.Paragraph color="muted" size="sm">
              {copy.template.hint}
            </Typography.Paragraph>
          </div>
        ) : null}
      </div>

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
        params={{}}
        name="page"
        page={result.page}
        limit={query.limit}
        totalCount={result.totalCount}
        labels={text.catalog.pagination}
      />
    </div>
  );
}
