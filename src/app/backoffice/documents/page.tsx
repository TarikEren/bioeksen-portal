/**
 * The list of documents (IFU-10 screens, `/backoffice/documents` of the stage B3
 * UI table, mockup `DocumentListPage`).
 *
 * A server component that calls the service `listDocuments` directly. A holder of
 * `eifu.document.view` sees the list. "New document" shows with
 * `eifu.document.manage`. The search (document number or title), the product
 * filter and the page number are in the URL; a value that does not parse is a
 * missing page (`notFound`). The product filter shows with `catalog.product.view`,
 * which the catalog service needs to list the products. Each row names the version
 * in force today and its state, and not "the latest version": the lookup never
 * selects a version because it is the newest (DEC-061). A document number, a
 * revision label, a stem and a date are in IBM Plex Mono (DEC-016); a date goes
 * through the project formatter (DEC-133). A state is an icon and a text (DEC-019).
 * The table has no minimum width, so it fits at 1024 px beside the sidebar.
 */
import { Card, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppButtonLink } from "@/app/_components/app-button-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { ForbiddenNotice } from "@/app/backoffice/_components/forbidden-notice";
import { PaginationNav } from "@/app/backoffice/_components/pagination-nav";
import { VersionStatusChip } from "@/app/backoffice/_components/version-status-chip";
import { AppError } from "@/lib/errors";
import { formatBusinessDate } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { type DocumentListQuery, parseDocumentListQuery } from "@/lib/schemas/eifu";
import { listDocuments } from "@/modules/eifu/services/document-service";

import { DocumentFilters } from "./_components/document-filters";
import { productOptions } from "./_lib/product-options";

const BASE_PATH = "/backoffice/documents";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.eifu.documents.title };
}

/** The query values of the view that are text, with an empty value left out. */
function textParams(searchParams: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const name of ["q", "productId", "page"]) {
    const value = searchParams[name];
    if (typeof value === "string" && value !== "") {
      params[name] = value;
    }
  }
  return params;
}

/** Reads the query of the view. A value that does not parse is a missing page. */
function readListQuery(params: Readonly<Record<string, string>>): DocumentListQuery {
  try {
    return parseDocumentListQuery(new URLSearchParams(params));
  } catch (error) {
    if (error instanceof AppError) {
      notFound();
    }
    throw error;
  }
}

export default async function DocumentsPage({ searchParams }: PageProps<"/backoffice/documents">) {
  const session = await requireSession();
  const { language, text } = await getRequestText();
  const params = textParams(await searchParams);
  const query = readListQuery(params);
  const copy = text.eifu.documents;

  if (!session.actor.permissions.has("eifu.document.view")) {
    return <ForbiddenNotice title={text.eifu.forbidden.title} body={text.eifu.forbidden.body} />;
  }

  const result = await listDocuments(session.actor, query);
  const canManage = session.actor.permissions.has("eifu.document.manage");
  const products = session.actor.permissions.has("catalog.product.view")
    ? await productOptions(session.actor, text, language, null)
    : null;

  const columns: DataTableColumn[] = [
    { key: "number", label: copy.columns.number, isRowHeader: true, cellClassName: "font-mono break-all" },
    { key: "title", label: copy.columns.title, cellClassName: "break-words" },
    { key: "product", label: copy.columns.product },
    { key: "inForce", label: copy.columns.inForce },
    { key: "versions", label: copy.columns.versions, cellClassName: "tabular-nums" },
  ];
  const rows: DataTableRow[] = result.documents.map((document) => ({
    id: document.id,
    href: `${BASE_PATH}/${document.id}`,
    cells: {
      number: document.documentNumber,
      title: document.title[language],
      product: (
        <span className="flex flex-col">
          <span className="font-mono break-all">{document.product.internalCode}</span>
          <span className="text-muted">{text.catalog.regulatoryStatus[document.product.regulatoryStatus]}</span>
        </span>
      ),
      inForce:
        document.versionInForce === null ? (
          <span className="text-muted">{copy.noneInForce}</span>
        ) : (
          <span className="flex flex-col items-start gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{document.versionInForce.revision}</span>
              <VersionStatusChip
                status={document.versionInForce.status}
                label={text.eifu.status[document.versionInForce.status]}
              />
            </span>
            <span className="text-muted">
              {fmt(copy.inForceSince, { date: formatBusinessDate(document.versionInForce.effectiveFrom, language) })}
            </span>
          </span>
        ),
      versions: String(document.versionCount),
    },
  }));

  const viewParams = Object.fromEntries(Object.entries(params).filter(([name]) => name !== "page"));

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
          {canManage ? <AppButtonLink href={`${BASE_PATH}/new`}>{copy.newDocument}</AppButtonLink> : null}
        </div>
      </div>

      <DocumentFilters
        basePath={BASE_PATH}
        defaults={{ q: query.q ?? "", productId: query.productId }}
        products={products}
        labels={{
          form: copy.search.form,
          search: copy.search.label,
          placeholder: copy.search.placeholder,
          product: copy.search.product,
          anyProduct: copy.search.anyProduct,
          submit: copy.search.submit,
        }}
      />

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
