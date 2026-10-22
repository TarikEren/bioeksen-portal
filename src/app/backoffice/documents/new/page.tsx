/**
 * The page that creates a document (IFU-10.AC1, AC2, `/backoffice/documents/new`
 * of the stage B3 UI table).
 *
 * A server component. A holder of `eifu.document.manage` sees the form. The
 * action checks the permission again when the form submits, because hiding a page
 * is not authorization (`sds-nextjs-frontend` §2). The product choice needs
 * `catalog.product.view`, because the catalog service lists the products only for
 * that permission; without it the page says so. The query `?productId=` is the
 * link from the product page: a value that is no id, or no product in the choice,
 * starts the form with no product (URL input is validated, `sds-nextjs-frontend`
 * §7). The page gives the form only the text it shows and the product options.
 */
import { Typography } from "@heroui/react";
import type { Metadata } from "next";

import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { ForbiddenNotice } from "@/app/backoffice/_components/forbidden-notice";
import { eifuFailureLabels } from "@/app/backoffice/_lib/eifu-failure";

import { productOptions } from "../_lib/product-options";
import { CreateDocumentForm } from "./_components/create-document-form";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.eifu.create.title };
}

export default async function NewDocumentPage({ searchParams }: PageProps<"/backoffice/documents/new">) {
  const session = await requireSession();
  const { language, text } = await getRequestText();

  if (!session.actor.permissions.has("eifu.document.manage")) {
    return <ForbiddenNotice title={text.eifu.forbidden.title} body={text.eifu.forbidden.body} />;
  }
  if (!session.actor.permissions.has("catalog.product.view")) {
    return <ForbiddenNotice title={text.eifu.create.title} body={text.eifu.productNeeded} />;
  }

  const copy = text.eifu.create;
  const products = await productOptions(session.actor, text, language, null);
  const requested = (await searchParams).productId;
  const initialProductId = products.find((option) => option.id === requested)?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: text.eifu.documents.title, href: "/backoffice/documents" },
            { label: copy.title },
          ]}
        />
        <div className="flex flex-col gap-1">
          <Typography.Heading level={1} weight="semibold">
            {copy.title}
          </Typography.Heading>
          <Typography.Paragraph color="muted" size="sm">
            {copy.description}
          </Typography.Paragraph>
        </div>
      </div>
      <CreateDocumentForm
        products={products}
        initialProductId={initialProductId}
        labels={{
          number: copy.number,
          numberHint: copy.numberHint,
          titleTr: copy.titleTr,
          titleEn: copy.titleEn,
          product: copy.product,
          productPlaceholder: copy.productPlaceholder,
          productHint: copy.productHint,
          submit: copy.submit,
          cancel: copy.cancel,
          saving: text.common.saving,
        }}
        failure={eifuFailureLabels(text, "createDocument")}
      />
    </div>
  );
}
