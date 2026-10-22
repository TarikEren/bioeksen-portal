/**
 * The page of a new LOT import (CAT-60, `/backoffice/catalog/lot-imports/new` of
 * the stage B2 UI table, mockup `LotImportPage`).
 *
 * A server component. A holder of `catalog.lot.manage` sees the form, with the
 * choice of one product. The choice lists the active products, which the person
 * may read with `catalog.product.view`; a person without it can still import
 * for all products. The actions check the permission again when the form
 * submits, because hiding a page is not authorization (`sds-nextjs-frontend` §2).
 * The page gives the form only the text it shows and the choices.
 */
import { Typography } from "@heroui/react";
import type { Metadata } from "next";

import { failureLabels } from "@/app/_components/failure";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { MAX_LIMIT } from "@/lib/schemas/identity";
import { listProducts } from "@/modules/catalog/services/product-service";

import { ForbiddenNotice } from "../../../_components/forbidden-notice";
import { ImportForm } from "./_components/import-form";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.catalog.imports.new.title };
}

export default async function NewLotImportPage() {
  const session = await requireSession();
  const { text } = await getRequestText();

  if (!session.actor.permissions.has("catalog.lot.manage")) {
    return <ForbiddenNotice title={text.catalog.forbidden.title} body={text.catalog.forbidden.body} />;
  }

  const products = session.actor.permissions.has("catalog.product.view")
    ? (await listProducts(session.actor, { page: 1, limit: MAX_LIMIT, q: null, active: true })).products.map((product) => ({
        value: product.id,
        label: `${product.internalCode} ${text.catalog.regulatoryStatus[product.regulatoryStatus]}`,
      }))
    : [];

  const copy = text.catalog.imports;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: copy.title, href: "/backoffice/catalog/lot-imports" },
            { label: copy.new.title },
          ]}
        />
        <div className="flex flex-col gap-1">
          <Typography.Heading level={1} weight="semibold">
            {copy.new.title}
          </Typography.Heading>
          <Typography.Paragraph color="muted" size="sm">
            {copy.new.description}
          </Typography.Paragraph>
        </div>
      </div>
      <ImportForm
        products={products}
        labels={{
          ...copy.new,
          fieldLabels: copy.fieldLabels,
          counts: copy.counts,
          rowColumns: copy.rowColumns,
          outcome: copy.outcome,
          reason: copy.reason,
          regulatoryStatus: text.catalog.regulatoryStatus,
          empty: text.catalog.none,
        }}
        failure={failureLabels(text, copy.errors, copy.fieldIssues)}
      />
    </div>
  );
}
