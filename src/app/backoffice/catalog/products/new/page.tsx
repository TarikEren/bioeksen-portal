/**
 * The page that creates a product (CAT-10.AC1 to AC3,
 * `/backoffice/catalog/products/new` of the stage B2 UI table).
 *
 * A server component. A holder of `catalog.product.manage` sees the form. The
 * action checks the permission again when the form submits, because hiding a page
 * is not authorization (`sds-nextjs-frontend` §2). The page gives the form only
 * the text it shows and the choices of the regulatory status.
 */
import { Typography } from "@heroui/react";
import type { Metadata } from "next";

import { failureLabels } from "@/app/_components/failure";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";

import { ForbiddenNotice } from "../../../_components/forbidden-notice";
import { statusOptions } from "../../_lib/options";
import { CreateProductForm } from "./_components/create-product-form";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.catalog.products.create.title };
}

export default async function NewProductPage() {
  const session = await requireSession();
  const { text } = await getRequestText();

  if (!session.actor.permissions.has("catalog.product.manage")) {
    return <ForbiddenNotice title={text.catalog.forbidden.title} body={text.catalog.forbidden.body} />;
  }

  const copy = text.catalog.products;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: copy.title, href: "/backoffice/catalog/products" },
            { label: copy.create.title },
          ]}
        />
        <div className="flex flex-col gap-1">
          <Typography.Heading level={1} weight="semibold">
            {copy.create.title}
          </Typography.Heading>
          <Typography.Paragraph color="muted" size="sm">
            {copy.create.description}
          </Typography.Paragraph>
        </div>
      </div>
      <CreateProductForm
        statuses={statusOptions(text)}
        labels={{
          ...copy.form,
          submit: copy.create.submit,
          saving: text.common.saving,
          cancel: copy.create.cancel,
        }}
        failure={failureLabels(text, copy.errors)}
      />
    </div>
  );
}
