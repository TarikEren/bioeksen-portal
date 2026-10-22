/**
 * The page of one version (IFU-10 *Screens*, IFU-20, IFU-30, IFU-31, IFU-32,
 * DEC-095, `/backoffice/documents/[id]/versions/[versionId]` of the stage B3 UI
 * table, mockup `DocumentDetailPage`).
 *
 * A server component that calls the service `getVersion` directly. Both ids in the
 * path are user input: an id that does not parse, a version that does not exist
 * (`RES-4200`) and a version of another document are a missing page (`notFound`).
 * The page shows the state, the period, the proposed start and the withdrawal of
 * the version, its files with their language, size, hash and download, the actions
 * of the moves and the history of the replaced files. Each control shows only with
 * its permission and with the state that the move needs: the files and the proposed
 * start with `eifu.document.manage`, the publication with `eifu.document.publish`,
 * the withdrawal with `eifu.document.withdraw`, the replacement of a file with
 * `eifu.document.replace_published_file`. Showing a control is not authorization:
 * the services decide (`sds-nextjs-frontend` §2). A document number, a revision
 * label, a stem, a hash and a date are in IBM Plex Mono (DEC-016), and a date goes
 * through the project formatter (DEC-133). A state is an icon and a text (DEC-019).
 * The user ids of the version (publisher, withdrawer) are not shown: the version
 * DTO has no name for them, and an id is not copy.
 */
import { Card, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { ForbiddenNotice } from "@/app/backoffice/_components/forbidden-notice";
import { VersionStatusChip } from "@/app/backoffice/_components/version-status-chip";
import { eifuFailureLabels } from "@/app/backoffice/_lib/eifu-failure";
import { periodText } from "@/app/backoffice/_lib/period-text";
import { AppError } from "@/lib/errors";
import { formatBusinessDate, formatDateTime } from "@/lib/format";
import { EntityId } from "@/lib/schemas/identity";
import { getVersion } from "@/modules/eifu/services/document-service";

import { FileList } from "./_components/file-list";
import { ReplacementList } from "./_components/replacement-list";
import { UploadFileForm } from "./_components/upload-file-form";
import { VersionActions } from "./_components/version-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.eifu.version.title };
}

export default async function VersionPage({ params }: PageProps<"/backoffice/documents/[id]/versions/[versionId]">) {
  const { id, versionId } = await params;
  if (!EntityId.safeParse(id).success || !EntityId.safeParse(versionId).success) {
    notFound();
  }
  const session = await requireSession();
  const { language, text } = await getRequestText();

  if (!session.actor.permissions.has("eifu.document.view")) {
    return <ForbiddenNotice title={text.eifu.forbidden.title} body={text.eifu.forbidden.body} />;
  }

  const version = await getVersion(session.actor, versionId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "RES-4200") {
      notFound();
    }
    throw error;
  });
  if (version.documentId !== id) {
    notFound();
  }

  const permissions = session.actor.permissions;
  const can = {
    manage: permissions.has("eifu.document.manage"),
    publish: permissions.has("eifu.document.publish"),
    withdraw: permissions.has("eifu.document.withdraw"),
    replace: permissions.has("eifu.document.replace_published_file"),
  };
  const copy = text.eifu.version;
  const productStatus = text.catalog.regulatoryStatus[version.product.regulatoryStatus];
  const hasActiveFile = version.files.some((file) => file.isActive);
  const canViewProducts = permissions.has("catalog.product.view");
  const timeText = (iso: string): string => formatDateTime(new Date(iso), language);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            { label: text.eifu.documents.title, href: "/backoffice/documents" },
            { label: version.documentNumber, href: `/backoffice/documents/${version.documentId}` },
            { label: version.revision },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Typography.Heading level={1} weight="semibold" className="min-w-0 break-all">
            {copy.revisionLabel} <span className="font-mono">{version.revision}</span>
          </Typography.Heading>
          <VersionStatusChip status={version.status} label={text.eifu.status[version.status]} />
        </div>
        <Typography.Paragraph color="muted" size="sm">
          <span className="font-mono">{version.documentNumber}</span> {version.documentTitle[language]}
        </Typography.Paragraph>
      </div>

      <Card>
        <Card.Content>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-muted">{copy.product}</dt>
            <dd className="min-w-0 break-words">
              {canViewProducts ? (
                <AppLink href={`/backoffice/catalog/products/${version.product.id}`} className="font-mono">
                  {version.product.internalCode}
                </AppLink>
              ) : (
                <span className="font-mono">{version.product.internalCode}</span>
              )}{" "}
              {productStatus} <span className="text-muted">{version.product.name[language]}</span>
            </dd>
            <dt className="text-muted">{copy.period}</dt>
            <dd>
              <span className="font-mono">{periodText(version.period, text.eifu.period, language)}</span>
              {version.period !== null && version.period.withdrawnAt !== null ? (
                <span className="text-muted"> {text.eifu.period.withdrawn}</span>
              ) : null}
            </dd>
            <dt className="text-muted">{copy.proposedStart}</dt>
            <dd className="font-mono">
              {version.proposedEffectiveFrom === null ? (
                <span className="font-sans text-muted">{copy.notProposed}</span>
              ) : (
                formatBusinessDate(version.proposedEffectiveFrom, language)
              )}
            </dd>
            {version.publishedAt === null ? null : (
              <>
                <dt className="text-muted">{copy.published}</dt>
                <dd className="tabular-nums">{timeText(version.publishedAt)}</dd>
              </>
            )}
            {version.supersededAt === null ? null : (
              <>
                <dt className="text-muted">{copy.superseded}</dt>
                <dd className="tabular-nums">{timeText(version.supersededAt)}</dd>
              </>
            )}
            {version.withdrawnAt === null ? null : (
              <>
                <dt className="text-muted">{copy.withdrawn}</dt>
                <dd className="tabular-nums">{timeText(version.withdrawnAt)}</dd>
                <dt className="text-muted">{copy.withdrawalReason}</dt>
                <dd className="min-w-0 break-words">{version.withdrawalReason ?? text.eifu.none}</dd>
              </>
            )}
          </dl>
        </Card.Content>
      </Card>

      {can.manage || can.publish || can.withdraw ? (
        <section aria-labelledby="version-actions-title" className="flex flex-col gap-3">
          <Typography.Heading level={2} weight="semibold" id="version-actions-title">
            {copy.actionsTitle}
          </Typography.Heading>
          <Card>
            <Card.Content>
              <VersionActions
                versionId={version.id}
                status={version.status}
                can={{ manage: can.manage, publish: can.publish, withdraw: can.withdraw }}
                productId={version.product.id}
                product={{ code: version.product.internalCode, status: productStatus, name: version.product.name[language] }}
                proposedStart={version.proposedEffectiveFrom ?? ""}
                hasActiveFile={hasActiveFile}
                labels={{
                  noActions: copy.noActions,
                  proposed: { ...copy.proposed, saving: text.common.saving },
                  publish: copy.publish,
                  withdraw: { ...copy.withdraw, saving: text.common.saving },
                }}
                failure={{
                  proposed: eifuFailureLabels(text, "updateVersion"),
                  publish: eifuFailureLabels(text, "publish"),
                  withdraw: eifuFailureLabels(text, "withdraw"),
                }}
              />
            </Card.Content>
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="files-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="files-title">
          {text.eifu.files.title}
        </Typography.Heading>
        <FileList
          files={version.files}
          status={version.status}
          can={{ manage: can.manage, replace: can.replace }}
          language={language}
          text={text}
        />
        {can.manage && version.status === "DRAFT" ? (
          <Card>
            <Card.Header>
              <Card.Title>{text.eifu.files.upload.title}</Card.Title>
              <Card.Description>{text.eifu.files.upload.lede}</Card.Description>
            </Card.Header>
            <Card.Content>
              <UploadFileForm
                versionId={version.id}
                labels={text.eifu.files.upload}
                failure={eifuFailureLabels(text, "upload")}
              />
            </Card.Content>
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="replacements-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="replacements-title">
          {text.eifu.replacements.title}
        </Typography.Heading>
        <ReplacementList replacements={version.replacements} language={language} text={text} />
      </section>
    </div>
  );
}
