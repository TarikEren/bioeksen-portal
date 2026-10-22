/**
 * The page of one document (IFU-10 *Screens*, `/backoffice/documents/[id]` of the
 * stage B3 UI table, mockup `DocumentDetailPage`).
 *
 * A server component that calls the service `getDocument` directly. The id in the
 * path is user input: an id that does not parse, and a document that does not
 * exist (`RES-4200`), are a missing page (`notFound`). The page shows the details
 * and the versions as a timeline with their states and periods; the lookup
 * resolves a LOT by period, so no version is marked as the current one (DEC-061).
 * The change of the document and "new version" show with `eifu.document.manage`.
 * The product changes only while `productChangeAllowed` is true (IFU-10 rule 2); the
 * choice of the product needs `catalog.product.view`. Showing a control is not
 * authorization (`sds-nextjs-frontend` §2). A document number, a stem and a date
 * are in IBM Plex Mono (DEC-016), and a date goes through the project formatter
 * (DEC-133).
 */
import { Card, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { ForbiddenNotice } from "@/app/backoffice/_components/forbidden-notice";
import { eifuFailureLabels } from "@/app/backoffice/_lib/eifu-failure";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { EntityId } from "@/lib/schemas/identity";
import { getDocument } from "@/modules/eifu/services/document-service";

import { productOptions } from "../_lib/product-options";
import { DocumentActions } from "./_components/document-actions";
import { VersionTimeline } from "./_components/version-timeline";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.eifu.document.title };
}

export default async function DocumentPage({ params }: PageProps<"/backoffice/documents/[id]">) {
  const { id } = await params;
  if (!EntityId.safeParse(id).success) {
    notFound();
  }
  const session = await requireSession();
  const { language, text } = await getRequestText();

  if (!session.actor.permissions.has("eifu.document.view")) {
    return <ForbiddenNotice title={text.eifu.forbidden.title} body={text.eifu.forbidden.body} />;
  }

  const document = await getDocument(session.actor, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "RES-4200") {
      notFound();
    }
    throw error;
  });

  const permissions = session.actor.permissions;
  const canManage = permissions.has("eifu.document.manage");
  const canViewProducts = permissions.has("catalog.product.view");
  const products =
    canManage && canViewProducts && document.productChangeAllowed
      ? await productOptions(session.actor, text, language, document.product)
      : null;

  const copy = text.eifu.document;
  const productText = text.catalog.regulatoryStatus[document.product.regulatoryStatus];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: text.eifu.documents.title, href: "/backoffice/documents" },
            { label: document.documentNumber },
          ]}
        />
        <Typography.Heading level={1} weight="semibold" className="min-w-0 font-mono break-all">
          {document.documentNumber}
        </Typography.Heading>
        <Typography.Paragraph color="muted" size="sm">
          {document.title[language]}
        </Typography.Paragraph>
      </div>

      <Card>
        <Card.Content>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-muted">{copy.product}</dt>
            <dd className="min-w-0 break-words">
              {canViewProducts ? (
                <AppLink href={`/backoffice/catalog/products/${document.product.id}`} className="font-mono">
                  {document.product.internalCode}
                </AppLink>
              ) : (
                <span className="font-mono">{document.product.internalCode}</span>
              )}{" "}
              {productText} <span className="text-muted">{document.product.name[language]}</span>
            </dd>
            <dt className="text-muted">{copy.created}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date(document.createdAt), language)}</dd>
            <dt className="text-muted">{copy.updated}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date(document.updatedAt), language)}</dd>
          </dl>
        </Card.Content>
      </Card>

      {canManage ? (
        <Card>
          <Card.Content>
            <DocumentActions
              documentId={document.id}
              values={{ titleTr: document.title.tr, titleEn: document.title.en, productId: document.product.id }}
              productChangeAllowed={document.productChangeAllowed}
              products={products}
              labels={{
                edit: { ...copy.edit, productLocked: copy.productLocked, saving: text.common.saving },
                newVersion: { ...copy.newVersion, saving: text.common.saving },
              }}
              editFailure={eifuFailureLabels(text, "updateDocument")}
              versionFailure={eifuFailureLabels(text, "createVersion")}
            />
          </Card.Content>
        </Card>
      ) : null}

      <section aria-labelledby="versions-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="versions-title">
          {copy.versions.title}
        </Typography.Heading>
        <Typography.Paragraph color="muted" size="sm">
          {text.eifu.period.hint}
        </Typography.Paragraph>
        <VersionTimeline documentId={document.id} versions={document.versions} language={language} text={text} />
      </section>
    </div>
  );
}
