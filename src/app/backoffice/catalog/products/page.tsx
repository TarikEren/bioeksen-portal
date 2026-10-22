/**
 * The product list (CAT-10, `/backoffice/catalog/products` of the stage B2 UI
 * table, mockup `ProductListPage`).
 *
 * A server component that calls the service `listProducts` directly. A holder of
 * `catalog.product.view` sees the list. "New product" shows with
 * `catalog.product.manage`. The search (stem, name in either language, catalog
 * number), the state filter and the page number are in the URL; a value that does
 * not parse is a missing page (`notFound`). The regulatory status is a column
 * beside the stem, because the stem alone is not the product: `BS-STI-L` exists as
 * IVD and as RUO (DEC-040). The stem is in IBM Plex Mono (FND-09.AC3). The table
 * has no minimum width, so it fits at 1024 px beside the sidebar (R-063). The
 * state is an icon and a text (DEC-019). The mockup shows cards; the list here is
 * a table, because the identity of a product is two columns and the counts are
 * numbers to compare.
 */
import { Card, Chip, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppButtonLink } from "@/app/_components/app-button-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { StatusIcon } from "@/app/_components/status-icon";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { AppError } from "@/lib/errors";
import { fmt } from "@/lib/i18n";
import { type ProductListQuery, parseProductListQuery } from "@/lib/schemas/catalog";
import { listProducts } from "@/modules/catalog/services/product-service";

import { ForbiddenNotice } from "../../_components/forbidden-notice";
import { PaginationNav } from "../_components/pagination-nav";
import { ProductFilters } from "./_components/product-filters";

const BASE_PATH = "/backoffice/catalog/products";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.catalog.products.title };
}

/** The query values of the view that are text, with an empty value left out. */
function textParams(searchParams: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const name of ["q", "active", "page"]) {
    const value = searchParams[name];
    if (typeof value === "string" && value !== "") {
      params[name] = value;
    }
  }
  return params;
}

/** Reads the query of the view. A value that does not parse is a missing page. */
function readListQuery(params: Readonly<Record<string, string>>): ProductListQuery {
  try {
    return parseProductListQuery(new URLSearchParams(params));
  } catch (error) {
    if (error instanceof AppError) {
      notFound();
    }
    throw error;
  }
}

export default async function ProductsPage({ searchParams }: PageProps<"/backoffice/catalog/products">) {
  const session = await requireSession();
  const { language, text } = await getRequestText();
  const params = textParams(await searchParams);
  const query = readListQuery(params);
  const copy = text.catalog.products;

  if (!session.actor.permissions.has("catalog.product.view")) {
    return <ForbiddenNotice title={text.catalog.forbidden.title} body={text.catalog.forbidden.body} />;
  }

  const result = await listProducts(session.actor, query);
  const canManage = session.actor.permissions.has("catalog.product.manage");

  const columns: DataTableColumn[] = [
    { key: "stem", label: copy.columns.stem, isRowHeader: true, cellClassName: "font-mono break-all" },
    { key: "status", label: copy.columns.status },
    { key: "name", label: copy.columns.name, cellClassName: "break-words" },
    { key: "catalogNumbers", label: copy.columns.catalogNumbers, cellClassName: "tabular-nums" },
    { key: "lots", label: copy.columns.lots, cellClassName: "tabular-nums" },
    { key: "state", label: copy.columns.state },
  ];
  const rows: DataTableRow[] = result.products.map((product) => ({
    id: product.id,
    href: `${BASE_PATH}/${product.id}`,
    cells: {
      stem: product.internalCode,
      status: (
        <Chip size="sm" color="default" variant="secondary">
          <Chip.Label>{text.catalog.regulatoryStatus[product.regulatoryStatus]}</Chip.Label>
        </Chip>
      ),
      name: product.name[language],
      catalogNumbers: String(product.catalogNumberCount),
      lots: String(product.lotCount),
      state: (
        <Chip size="sm" color="default" variant="secondary">
          <StatusIcon isActive={product.isActive} />
          <Chip.Label>{product.isActive ? copy.state.active : copy.state.inactive}</Chip.Label>
        </Chip>
      ),
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
          {canManage ? <AppButtonLink href={`${BASE_PATH}/new`}>{copy.newProduct}</AppButtonLink> : null}
        </div>
      </div>

      <ProductFilters
        basePath={BASE_PATH}
        defaults={{ q: query.q ?? "", active: query.active === null ? "all" : query.active ? "true" : "false" }}
        labels={{
          form: copy.search.form,
          search: copy.search.label,
          placeholder: copy.search.placeholder,
          state: copy.search.state,
          any: copy.search.any,
          active: copy.state.active,
          inactive: copy.state.inactive,
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
