/**
 * The page of one product (CAT-10, CAT-20, CAT-40, CAT-41, CAT-50, DEC-046,
 * DEC-050, `/backoffice/catalog/products/[id]` of the stage B2 UI table, mockup
 * `ProductDetailPage`).
 *
 * A server component that calls the services `getProduct`, `listLots` and
 * `listProducts` directly. The id in the path is user input: an id that does not
 * parse, and a product that does not exist (`RES-4200`), are a missing page
 * (`notFound`). The page shows the details, the catalog numbers and the LOTs to
 * the holders of the view permissions. Each control shows only with its
 * permission: change and deactivate with `catalog.product.manage`, the catalog
 * number actions with `catalog.catalog_number.manage`, the single-LOT form with
 * `catalog.lot.manage` and the date correction with `catalog.lot.correct`. Showing
 * a control is not authorization (`sds-nextjs-frontend` §2). The LOT filter
 * (catalog number, conflicts only) and the LOT page number are in the URL, so a
 * link opens the same view. The expected kit code of each catalog number is
 * computed here from the domain function (DEC-048), and no client component reads
 * a LOT number (CAT-30 rule 3). A catalog number, a LOT number and a date are in
 * IBM Plex Mono (FND-09.AC3), and a date goes through the project formatter
 * (DEC-133). The conflict marker and the states are an icon and a text (DEC-019).
 * Stage B3 adds the section *Documents* with the documents of the product and the
 * version in force today (`eifu.document.view`), and links each LOT number to its
 * LOT page, where the override is set (IFU-40, DEC-094; `eifu.document.view`).
 */
import { Card, Chip, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { failureLabels } from "@/app/_components/failure";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { StatusIcon } from "@/app/_components/status-icon";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { AppError } from "@/lib/errors";
import { formatBusinessDate, formatDateTime } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { type LotListQuery, parseLotListQuery } from "@/lib/schemas/catalog";
import { EntityId, MAX_LIMIT } from "@/lib/schemas/identity";
import { expectedKitCode } from "@/modules/catalog/domain/kit-code";
import { listLots } from "@/modules/catalog/services/lot-service";
import { getProduct, listProducts } from "@/modules/catalog/services/product-service";
import { listDocuments } from "@/modules/eifu/services/document-service";

import { ForbiddenNotice } from "../../../_components/forbidden-notice";
import { PaginationNav } from "@/app/backoffice/_components/pagination-nav";
import { formatOptions, statusOptions } from "../../_lib/options";
import { CatalogNumbersSection } from "./_components/catalog-numbers-section";
import { CorrectDateButton } from "./_components/correct-date-button";
import { LotDateCell } from "./_components/lot-date-cell";
import { ProductActions } from "./_components/product-actions";
import { ProductDocumentsSection } from "./_components/product-documents-section";
import { RegisterLotForm } from "./_components/register-lot-form";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.catalog.products.detail.title };
}

/** The query values of the LOT view that are text, with an empty value left out. */
function lotParams(searchParams: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const name of ["catalogNumberId", "conflict", "lotsPage"]) {
    const value = searchParams[name];
    if (typeof value === "string" && value !== "") {
      params[name] = value;
    }
  }
  return params;
}

/** Reads the LOT query of the view. A value that does not parse is a missing page. */
function readLotQuery(params: Readonly<Record<string, string>>): LotListQuery {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    query.set(name === "lotsPage" ? "page" : name, value);
  }
  try {
    return parseLotListQuery(query);
  } catch (error) {
    if (error instanceof AppError) {
      notFound();
    }
    throw error;
  }
}

export default async function ProductPage({ params, searchParams }: PageProps<"/backoffice/catalog/products/[id]">) {
  const { id } = await params;
  if (!EntityId.safeParse(id).success) {
    notFound();
  }
  const session = await requireSession();
  const { language, text } = await getRequestText();
  const view = lotParams(await searchParams);
  const lotQuery = readLotQuery(view);

  if (!session.actor.permissions.has("catalog.product.view")) {
    return <ForbiddenNotice title={text.catalog.forbidden.title} body={text.catalog.forbidden.body} />;
  }

  const product = await getProduct(session.actor, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "RES-4200") {
      notFound();
    }
    throw error;
  });

  const permissions = session.actor.permissions;
  const canManageProduct = permissions.has("catalog.product.manage");
  const canManageNumbers = permissions.has("catalog.catalog_number.manage");
  const canViewLots = permissions.has("catalog.lot.view");
  const canManageLots = permissions.has("catalog.lot.manage");
  const canCorrect = permissions.has("catalog.lot.correct");
  const canViewDocuments = permissions.has("eifu.document.view");
  const canManageDocuments = permissions.has("eifu.document.manage");

  const lots = canViewLots
    ? await listLots(session.actor, product.id, lotQuery).catch((error: unknown) => {
        if (error instanceof AppError && error.code === "RES-4200") {
          notFound();
        }
        throw error;
      })
    : null;
  const documents = canViewDocuments
    ? (await listDocuments(session.actor, { page: 1, limit: MAX_LIMIT, productId: product.id, q: null })).documents
    : null;
  const moveTargets = canManageNumbers
    ? (await listProducts(session.actor, { page: 1, limit: MAX_LIMIT, q: null, active: true })).products
        .filter((candidate) => candidate.id !== product.id)
        .map((candidate) => ({
          id: candidate.id,
          label: `${candidate.internalCode} ${text.catalog.regulatoryStatus[candidate.regulatoryStatus]}`,
        }))
    : [];

  const copy = text.catalog;
  const detail = copy.products.detail;
  const failure = failureLabels(text, copy.products.errors);
  const numberFailure = failureLabels(text, copy.catalogNumbers.errors);
  const lotFailure = failureLabels(text, copy.lots.errors, copy.lots.fieldIssues);
  const stateText = (isActive: boolean): string => (isActive ? copy.products.state.active : copy.products.state.inactive);
  const dateText = (date: string): string => formatBusinessDate(date, language);
  const hasLots = product.lotCount > 0;

  const lotColumns: DataTableColumn[] = [
    { key: "lotNumber", label: copy.lots.columns.lotNumber, isRowHeader: true, cellClassName: "font-mono break-all" },
    { key: "catalogNumber", label: copy.lots.columns.catalogNumber, cellClassName: "font-mono break-all" },
    { key: "manufacturingDate", label: copy.lots.columns.manufacturingDate },
    { key: "expiryDate", label: copy.lots.columns.expiryDate, cellClassName: "font-mono" },
    ...(canCorrect ? [{ key: "actions", label: copy.lots.columns.actions }] : []),
  ];
  const lotRows: DataTableRow[] = (lots?.lots ?? []).map((lot) => ({
    id: lot.id,
    cells: {
      // The LOT page needs `eifu.document.view`, so only a holder of it gets the link (IFU-40).
      lotNumber: canViewDocuments ? <AppLink href={`/backoffice/catalog/lots/${lot.id}`}>{lot.lotNumber}</AppLink> : lot.lotNumber,
      catalogNumber: lot.catalogNumber,
      manufacturingDate: (
        <LotDateCell
          manufacturingDate={dateText(lot.manufacturingDate)}
          source={copy.lots.source[lot.manufacturingDateSource]}
          conflict={
            lot.hasDateConflict && lot.suppliedManufacturingDate !== null
              ? {
                  label: copy.lots.conflict.label,
                  suppliedLabel: copy.lots.correct.supplied,
                  supplied: dateText(lot.suppliedManufacturingDate),
                  encodedLabel: copy.lots.correct.encoded,
                  encoded: dateText(lot.encodedManufacturingDate),
                }
              : null
          }
        />
      ),
      expiryDate: lot.expiryDate === null ? <span className="font-sans text-muted">{copy.none}</span> : dateText(lot.expiryDate),
      actions: (
        <CorrectDateButton
          lotId={lot.id}
          storedDate={lot.manufacturingDate}
          dates={{
            stored: dateText(lot.manufacturingDate),
            encoded: dateText(lot.encodedManufacturingDate),
            supplied: lot.suppliedManufacturingDate === null ? null : dateText(lot.suppliedManufacturingDate),
          }}
          labels={{
            ...copy.lots.correct,
            buttonLabel: fmt(copy.lots.correct.buttonLabel, { lot: lot.lotNumber }),
            lede: fmt(copy.lots.correct.lede, { lot: lot.lotNumber, catalogNumber: lot.catalogNumber }),
            saving: text.common.saving,
          }}
          failure={lotFailure}
        />
      ),
    },
  }));

  /** The URL of the LOT view with one filter changed. A new filter starts on page one. */
  const lotHref = (change: Readonly<Record<string, string | null>>): string => {
    const query = new URLSearchParams(Object.entries(view).filter(([name]) => name !== "lotsPage"));
    for (const [name, value] of Object.entries(change)) {
      if (value === null) {
        query.delete(name);
      } else {
        query.set(name, value);
      }
    }
    const textQuery = query.toString();
    return textQuery === "" ? `/backoffice/catalog/products/${product.id}` : `/backoffice/catalog/products/${product.id}?${textQuery}`;
  };
  const lotViewParams = Object.fromEntries(Object.entries(view).filter(([name]) => name !== "lotsPage"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: copy.products.title, href: "/backoffice/catalog/products" },
            { label: product.internalCode },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Typography.Heading level={1} weight="semibold" className="min-w-0 font-mono break-all">
            {product.internalCode}
          </Typography.Heading>
          <Chip size="sm" color="default" variant="secondary">
            <Chip.Label>{copy.regulatoryStatus[product.regulatoryStatus]}</Chip.Label>
          </Chip>
          <Chip size="sm" color="default" variant="secondary">
            <StatusIcon isActive={product.isActive} />
            <Chip.Label>{stateText(product.isActive)}</Chip.Label>
          </Chip>
        </div>
        <Typography.Paragraph color="muted" size="sm">
          {product.name[language]}
        </Typography.Paragraph>
      </div>

      <Card>
        <Card.Content>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-muted">{detail.kitCodeBase}</dt>
            <dd className="min-w-0 break-words">
              {product.kitCodeBase === null ? (
                detail.kitCodeUnchecked
              ) : (
                <span className="font-mono">{product.kitCodeBase}</span>
              )}
            </dd>
            <dt className="text-muted">{detail.description}</dt>
            <dd className="min-w-0 break-words">{product.description?.[language] ?? detail.noDescription}</dd>
            <dt className="text-muted">{detail.created}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date(product.createdAt), language)}</dd>
            <dt className="text-muted">{detail.updated}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date(product.updatedAt), language)}</dd>
          </dl>
        </Card.Content>
      </Card>

      {canManageProduct ? (
        <Card>
          <Card.Content>
            <ProductActions
              productId={product.id}
              values={{
                internalCode: product.internalCode,
                nameTr: product.name.tr,
                nameEn: product.name.en,
                descriptionTr: product.description?.tr ?? "",
                descriptionEn: product.description?.en ?? "",
                regulatoryStatus: product.regulatoryStatus,
                kitCodeBase: product.kitCodeBase ?? "",
              }}
              identityLocked={hasLots}
              canDeactivate={product.isActive}
              statuses={statusOptions(text)}
              labels={{
                edit: {
                  ...copy.products.form,
                  ...detail.edit,
                  saving: text.common.saving,
                },
                deactivate: detail.deactivate,
              }}
              failure={failure}
            />
          </Card.Content>
        </Card>
      ) : null}

      <section aria-labelledby="catalog-numbers-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="catalog-numbers-title">
          {copy.catalogNumbers.title}
        </Typography.Heading>
        <CatalogNumbersSection
          productId={product.id}
          canManage={canManageNumbers}
          rows={product.catalogNumbers.map((number) => ({
            id: number.id,
            catalogNumber: number.catalogNumber,
            format: number.format,
            packSize: number.packSize,
            lotCount: number.lotCount,
            isActive: number.isActive,
          }))}
          formats={formatOptions(text)}
          targets={moveTargets}
          labels={{
            table: copy.catalogNumbers.table,
            empty: copy.catalogNumbers.empty,
            notSet: copy.notSet,
            active: copy.products.state.active,
            inactive: copy.products.state.inactive,
            columns: copy.catalogNumbers.columns,
            form: copy.catalogNumbers.form,
            saving: text.common.saving,
            add: copy.catalogNumbers.add,
            edit: copy.catalogNumbers.edit,
            move: copy.catalogNumbers.move,
            deactivate: copy.catalogNumbers.deactivate,
          }}
          failure={numberFailure}
        />
      </section>

      {documents === null ? null : (
        <ProductDocumentsSection
          productId={product.id}
          documents={documents}
          canManage={canManageDocuments}
          language={language}
          text={text}
        />
      )}

      {lots === null ? null : (
        <section aria-labelledby="lots-title" className="flex flex-col gap-3">
          <Typography.Heading level={2} weight="semibold" id="lots-title">
            {copy.lots.title}
          </Typography.Heading>

          <div className="flex flex-col gap-2">
            <nav aria-label={copy.lots.filter.catalogNumber} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Typography.Paragraph color="muted" size="sm">
                {copy.lots.filter.catalogNumber}
              </Typography.Paragraph>
              <AppLink href={lotHref({ catalogNumberId: null })} isCurrent={lotQuery.catalogNumberId === null}>
                {copy.lots.filter.all}
              </AppLink>
              {product.catalogNumbers.map((number) => (
                <AppLink
                  key={number.id}
                  href={lotHref({ catalogNumberId: number.id })}
                  isCurrent={lotQuery.catalogNumberId === number.id}
                  className="font-mono"
                >
                  {number.catalogNumber}
                </AppLink>
              ))}
            </nav>
            <nav aria-label={copy.lots.filter.label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <AppLink href={lotHref({ conflict: null })} isCurrent={lotQuery.conflict === null}>
                {copy.lots.filter.all}
              </AppLink>
              <AppLink href={lotHref({ conflict: "true" })} isCurrent={lotQuery.conflict === true}>
                {copy.lots.filter.conflictOnly}
              </AppLink>
            </nav>
          </div>

          {lotRows.length === 0 ? (
            <Card variant="transparent">
              <Card.Content>
                <Typography.Paragraph color="muted" size="sm">
                  {copy.lots.empty}
                </Typography.Paragraph>
              </Card.Content>
            </Card>
          ) : (
            <DataTable ariaLabel={copy.lots.table} columns={lotColumns} rows={lotRows} />
          )}

          <PaginationNav
            basePath={`/backoffice/catalog/products/${product.id}`}
            params={lotViewParams}
            name="lotsPage"
            page={lots.page}
            limit={lotQuery.limit}
            totalCount={lots.totalCount}
            labels={copy.pagination}
          />

          {canManageLots ? (
            <Card>
              <Card.Header>
                <Card.Title>{copy.lots.register.title}</Card.Title>
              </Card.Header>
              <Card.Content>
                <RegisterLotForm
                  catalogNumbers={product.catalogNumbers
                    .filter((number) => number.isActive)
                    .map((number) => ({
                      id: number.id,
                      catalogNumber: number.catalogNumber,
                      expectedKitCode: expectedKitCode(product.kitCodeBase, number.format),
                    }))}
                  labels={{ ...copy.lots.register, saving: text.common.saving }}
                  failure={lotFailure}
                />
              </Card.Content>
            </Card>
          ) : null}
        </section>
      )}
    </div>
  );
}
