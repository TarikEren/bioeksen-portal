/**
 * The report of one LOT import (CAT-60 rule 2, rule 8, rule 10,
 * `/backoffice/catalog/lot-imports/[id]` of the stage B2 UI table).
 *
 * A server component that calls the services `getImport` and `listImportRows`
 * directly. The id in the path is user input: an id that does not parse, and an
 * import that does not exist (`RES-4200`), are a missing page (`notFound`). A
 * holder of `catalog.lot.view` sees the counts and the rows, each with its
 * outcome, its reason and the cells as they arrived. A failed import says so and
 * names the code that stopped it, with no LOT written (CAT-60.AC14). The outcome
 * filter and the page number are in the URL, so a link opens the same view; a
 * value that does not parse is a missing page. The hash of the input is in IBM
 * Plex Mono (DEC-016), and so are the cells of the rows (FND-09.AC3). A date goes
 * through the project formatter (DEC-133). An outcome and a status are an icon and
 * a text (DEC-019).
 */
import { Alert, Card, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { failureLabels } from "@/app/_components/failure";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { fmt, textForCode } from "@/lib/i18n/messages";
import { type ImportRowListQuery, OUTCOMES, parseImportRowListQuery } from "@/lib/schemas/catalog";
import { EntityId } from "@/lib/schemas/identity";
import { getImport, listImportRows } from "@/modules/catalog/services/lot-import-service";
import { getProduct } from "@/modules/catalog/services/product-service";

import { ForbiddenNotice } from "../../../_components/forbidden-notice";
import { ImportRowsTable } from "../../_components/import-rows-table";
import { ImportStatusChip } from "../../_components/import-status-chip";
import { PaginationNav } from "../../_components/pagination-nav";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.catalog.imports.report.title };
}

/** The query values of the view that are text, with an empty value left out. */
function viewParams(searchParams: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const name of ["outcome", "page"]) {
    const value = searchParams[name];
    if (typeof value === "string" && value !== "") {
      params[name] = value;
    }
  }
  return params;
}

/** Reads the query of the view. A value that does not parse is a missing page. */
function readRowQuery(params: Readonly<Record<string, string>>): ImportRowListQuery {
  try {
    return parseImportRowListQuery(new URLSearchParams(params));
  } catch (error) {
    if (error instanceof AppError) {
      notFound();
    }
    throw error;
  }
}

/** Runs a service call and turns `RES-4200` into a missing page. */
async function orNotFound<TValue>(call: Promise<TValue>): Promise<TValue> {
  return call.catch((error: unknown) => {
    if (error instanceof AppError && error.code === "RES-4200") {
      notFound();
    }
    throw error;
  });
}

export default async function LotImportReportPage({ params, searchParams }: PageProps<"/backoffice/catalog/lot-imports/[id]">) {
  const { id } = await params;
  if (!EntityId.safeParse(id).success) {
    notFound();
  }
  const session = await requireSession();
  const { language, text } = await getRequestText();
  const view = viewParams(await searchParams);
  const rowQuery = readRowQuery(view);

  if (!session.actor.permissions.has("catalog.lot.view")) {
    return <ForbiddenNotice title={text.catalog.forbidden.title} body={text.catalog.forbidden.body} />;
  }

  const lotImport = await orNotFound(getImport(session.actor, id));
  const result = await orNotFound(listImportRows(session.actor, id, rowQuery));
  const product =
    lotImport.productId !== null && session.actor.permissions.has("catalog.product.view")
      ? await getProduct(session.actor, lotImport.productId).catch(() => null)
      : null;

  const copy = text.catalog.imports;
  const report = copy.report;
  const basePath = `/backoffice/catalog/lot-imports/${lotImport.id}`;
  const outcomeHref = (outcome: string | null): string =>
    outcome === null ? basePath : `${basePath}?${new URLSearchParams({ outcome }).toString()}`;
  const filterParams = Object.fromEntries(Object.entries(view).filter(([name]) => name !== "page"));
  const counts = [
    { key: "created", label: copy.counts.created, value: lotImport.createdCount },
    { key: "existing", label: copy.counts.existing, value: lotImport.existingCount },
    { key: "conflict", label: copy.counts.conflict, value: lotImport.conflictCount },
    { key: "invalid", label: copy.counts.invalid, value: lotImport.invalidCount },
  ];
  const sourceText = lotImport.sourceFilename ?? copy.pasted;
  const productText =
    lotImport.productId === null
      ? copy.allProducts
      : product === null
        ? null
        : `${product.internalCode} ${text.catalog.regulatoryStatus[product.regulatoryStatus]}`;
  const errors = failureLabels(text, copy.errors).errors;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: copy.title, href: "/backoffice/catalog/lot-imports" },
            { label: fmt(report.description, { id: lotImport.id }) },
          ]}
        />
        <div className="flex flex-col gap-1">
          <Typography.Heading level={1} weight="semibold">
            {report.title}
          </Typography.Heading>
          <Typography.Paragraph color="muted" size="sm">
            {fmt(report.description, { id: lotImport.id })}
          </Typography.Paragraph>
        </div>
      </div>

      {lotImport.status === "FAILED" ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{report.failed}</Alert.Title>
            {lotImport.failureCode === null ? null : (
              <Alert.Description>
                {textForCode(errors, lotImport.failureCode, text.common.errors["SYS-5000"])}{" "}
                {fmt(report.failedCode, { code: lotImport.failureCode })}
              </Alert.Description>
            )}
          </Alert.Content>
        </Alert>
      ) : null}

      <Card>
        <Card.Content>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-muted">{report.status}</dt>
            <dd>
              <ImportStatusChip status={lotImport.status} label={copy.status[lotImport.status]} />
            </dd>
            <dt className="text-muted">{report.source}</dt>
            <dd className="min-w-0 break-words">{sourceText}</dd>
            {productText === null ? null : (
              <>
                <dt className="text-muted">{report.product}</dt>
                <dd className="min-w-0 break-words font-mono">{productText}</dd>
              </>
            )}
            <dt className="text-muted">{report.created}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date(lotImport.createdAt), language)}</dd>
            {lotImport.completedAt === null ? null : (
              <>
                <dt className="text-muted">{report.completed}</dt>
                <dd className="tabular-nums">{formatDateTime(new Date(lotImport.completedAt), language)}</dd>
              </>
            )}
            <dt className="text-muted">{report.hash}</dt>
            <dd className="min-w-0 break-all font-mono text-sm">{lotImport.sourceHash}</dd>
          </dl>
        </Card.Content>
      </Card>

      <section aria-labelledby="counts-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="counts-title">
          {report.summaryTitle}
        </Typography.Heading>
        <Card>
          <Card.Content>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
              <dt className="text-muted">{report.rowCount}</dt>
              <dd className="tabular-nums">{lotImport.rowCount}</dd>
              {counts.map((count) => (
                <div key={count.key} className="contents">
                  <dt className="text-muted">{count.label}</dt>
                  <dd className="tabular-nums">{count.value}</dd>
                </div>
              ))}
            </dl>
          </Card.Content>
        </Card>
      </section>

      <section aria-labelledby="rows-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="rows-title">
          {report.rowsTitle}
        </Typography.Heading>
        <nav aria-label={report.filterLabel} className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <AppLink href={outcomeHref(null)} isCurrent={rowQuery.outcome === null}>
            {report.filterAll}
          </AppLink>
          {OUTCOMES.map((outcome) => (
            <AppLink key={outcome} href={outcomeHref(outcome)} isCurrent={rowQuery.outcome === outcome}>
              {copy.outcome[outcome]}
            </AppLink>
          ))}
        </nav>

        {result.rows.length === 0 ? (
          <Card variant="transparent">
            <Card.Content>
              <Typography.Paragraph color="muted" size="sm">
                {report.rowsEmpty}
              </Typography.Paragraph>
            </Card.Content>
          </Card>
        ) : (
          <ImportRowsTable
            ariaLabel={report.rowsTable}
            rows={result.rows}
            labels={{
              columns: copy.rowColumns,
              outcome: copy.outcome,
              reason: copy.reason,
              empty: text.catalog.none,
            }}
          />
        )}

        <PaginationNav
          basePath={basePath}
          params={filterParams}
          name="page"
          page={result.page}
          limit={rowQuery.limit}
          totalCount={result.totalCount}
          labels={text.catalog.pagination}
        />
      </section>

      <div>
        <AppLink href="/backoffice/catalog/lot-imports">{report.back}</AppLink>
      </div>
    </div>
  );
}
