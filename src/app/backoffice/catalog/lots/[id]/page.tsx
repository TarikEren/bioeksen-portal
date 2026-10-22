/**
 * The page of one LOT, with its override (IFU-40 *Screens*, DEC-066, DEC-094,
 * `/backoffice/catalog/lots/[id]` of the stage B3 UI table, mockup
 * `LotOverridePage`).
 *
 * A server component. The id in the path is user input: an id that does not parse
 * and a LOT that does not exist are a missing page (`notFound`). The LOT comes from
 * the catalog service `findLotRef` (DEC-004), and its overrides from
 * `listOverridesOfLot`. The page needs `eifu.document.view`. It shows the LOT, its
 * active override, and the history of its ended overrides, newest first. The forms
 * that create and end an override show with `eifu.lot_override.manage`; showing a
 * control is not authorization (`sds-nextjs-frontend` §2). A LOT has at most one
 * active override (IFU-40 rule 2), so the page offers the creation when there is
 * none and the end when there is one. An override whose target version was
 * withdrawn shows a warning with a text, because the lookup reports it (IFU-40
 * rule 5). A LOT number, a catalog number, a stem, a document number, a revision
 * label and a date are in IBM Plex Mono (DEC-016); a date goes through the project
 * formatter (DEC-133). A state is an icon and a text (DEC-019). The reason is
 * record content, not copy.
 */
import { Alert, Card, Chip, Typography } from "@heroui/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { PageBreadcrumbs } from "@/app/_components/page-breadcrumbs";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { ForbiddenNotice } from "@/app/backoffice/_components/forbidden-notice";
import { VersionStatusChip } from "@/app/backoffice/_components/version-status-chip";
import { eifuFailureLabels } from "@/app/backoffice/_lib/eifu-failure";
import { AppError } from "@/lib/errors";
import { formatBusinessDate, formatDateTime } from "@/lib/format";
import { EntityId } from "@/lib/schemas/identity";
import { findLotRef } from "@/modules/catalog/services/catalog-reads";
import { listOverridesOfLot } from "@/modules/eifu/services/override-service";

import { OutcomeIcon } from "../../_components/outcome-icon";
import { LotOverrideControls } from "./_components/lot-override-controls";
import { versionChoices } from "./_lib/version-choices";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.eifu.lot.title };
}

export default async function LotPage({ params }: PageProps<"/backoffice/catalog/lots/[id]">) {
  const { id } = await params;
  if (!EntityId.safeParse(id).success) {
    notFound();
  }
  const session = await requireSession();
  const { language, text } = await getRequestText();

  if (!session.actor.permissions.has("eifu.document.view")) {
    return <ForbiddenNotice title={text.eifu.forbidden.title} body={text.eifu.forbidden.body} />;
  }

  const lot = await findLotRef(session.actor, id);
  if (lot === null) {
    notFound();
  }
  const { active, history } = await listOverridesOfLot(session.actor, lot.id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "RES-4200") {
      notFound();
    }
    throw error;
  });

  const permissions = session.actor.permissions;
  const canManage = permissions.has("eifu.lot_override.manage");
  const canViewProducts = permissions.has("catalog.product.view");
  const versions = canManage && active === null ? await versionChoices(session.actor, lot.productId, text, language) : [];

  const copy = text.eifu.lot;
  const productStatus = text.catalog.regulatoryStatus[lot.product.regulatoryStatus];
  const timeText = (iso: string): string => formatDateTime(new Date(iso), language);

  const historyColumns: DataTableColumn[] = [
    { key: "document", label: copy.history.columns.document, isRowHeader: true, cellClassName: "font-mono break-all" },
    { key: "reason", label: copy.history.columns.reason, cellClassName: "break-words" },
    { key: "created", label: copy.history.columns.created, cellClassName: "tabular-nums" },
    { key: "ended", label: copy.history.columns.ended, cellClassName: "tabular-nums" },
    { key: "endReason", label: copy.history.columns.endReason, cellClassName: "break-words" },
  ];
  const historyRows: DataTableRow[] = history.map((override) => ({
    id: override.id,
    cells: {
      document: (
        <AppLink href={`/backoffice/documents/${override.documentId}/versions/${override.documentVersionId}`}>
          {override.documentNumber} {override.revision}
        </AppLink>
      ),
      reason: override.reason,
      created: timeText(override.createdAt),
      ended: override.endedAt === null ? text.eifu.none : timeText(override.endedAt),
      endReason: override.endReason ?? text.eifu.none,
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageBreadcrumbs
          ariaLabel={text.common.breadcrumbs}
          trail={[
            { label: text.backoffice.nav.home, href: "/backoffice" },
            ...(canViewProducts
              ? [
                  { label: text.catalog.products.title, href: "/backoffice/catalog/products" },
                  { label: lot.product.internalCode, href: `/backoffice/catalog/products/${lot.productId}` },
                ]
              : []),
            { label: lot.lotNumber },
          ]}
        />
        <Typography.Heading level={1} weight="semibold" className="min-w-0 font-mono break-all">
          {lot.lotNumber}
        </Typography.Heading>
      </div>

      <Card>
        <Card.Content>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-muted">{copy.catalogNumber}</dt>
            <dd className="min-w-0 font-mono break-all">{lot.catalogNumber}</dd>
            <dt className="text-muted">{copy.product}</dt>
            <dd className="min-w-0 break-words">
              {canViewProducts ? (
                <AppLink href={`/backoffice/catalog/products/${lot.productId}`} className="font-mono">
                  {lot.product.internalCode}
                </AppLink>
              ) : (
                <span className="font-mono">{lot.product.internalCode}</span>
              )}{" "}
              {productStatus} <span className="text-muted">{lot.product.name[language]}</span>
            </dd>
            <dt className="text-muted">{copy.manufacturingDate}</dt>
            <dd className="flex flex-wrap items-center gap-3">
              <span className="font-mono">{formatBusinessDate(lot.manufacturingDate, language)}</span>
              {lot.hasDateConflict ? (
                <Chip size="sm" color="warning" variant="secondary">
                  <OutcomeIcon kind="conflict" />
                  <Chip.Label>{copy.dateConflict}</Chip.Label>
                </Chip>
              ) : null}
            </dd>
          </dl>
        </Card.Content>
      </Card>

      <section aria-labelledby="active-override-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="active-override-title">
          {copy.active.title}
        </Typography.Heading>
        {active === null ? (
          <Typography.Paragraph color="muted" size="sm">
            {copy.active.none}
          </Typography.Paragraph>
        ) : (
          <Card>
            <Card.Content className="flex flex-col gap-3">
              {active.versionStatus === "WITHDRAWN" ? (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{copy.active.withdrawnTitle}</Alert.Title>
                    <Alert.Description>{copy.active.withdrawnBody}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="text-muted">{copy.active.document}</dt>
                <dd className="min-w-0 font-mono break-all">
                  <AppLink href={`/backoffice/documents/${active.documentId}/versions/${active.documentVersionId}`}>
                    {active.documentNumber} {active.revision}
                  </AppLink>
                </dd>
                <dt className="text-muted">{copy.active.versionState}</dt>
                <dd>
                  <VersionStatusChip status={active.versionStatus} label={text.eifu.status[active.versionStatus]} />
                </dd>
                <dt className="text-muted">{copy.active.reason}</dt>
                <dd className="min-w-0 break-words">{active.reason}</dd>
                <dt className="text-muted">{copy.active.created}</dt>
                <dd className="tabular-nums">{timeText(active.createdAt)}</dd>
              </dl>
            </Card.Content>
          </Card>
        )}
        {canManage ? (
          <Card>
            <Card.Header>
              <Card.Title>{active === null ? copy.create.title : copy.end.button}</Card.Title>
            </Card.Header>
            <Card.Content>
              <LotOverrideControls
                lotId={lot.id}
                activeOverrideId={active === null ? null : active.id}
                versions={versions}
                labels={{
                  create: { ...copy.create, saving: text.common.saving },
                  end: { ...copy.end, saving: text.common.saving },
                }}
                failure={{
                  create: eifuFailureLabels(text, "createOverride"),
                  end: eifuFailureLabels(text, "endOverride"),
                }}
              />
            </Card.Content>
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="override-history-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="override-history-title">
          {copy.history.title}
        </Typography.Heading>
        {historyRows.length === 0 ? (
          <Card variant="transparent">
            <Card.Content>
              <Typography.Paragraph color="muted" size="sm">
                {copy.history.empty}
              </Typography.Paragraph>
            </Card.Content>
          </Card>
        ) : (
          <DataTable ariaLabel={copy.history.table} columns={historyColumns} rows={historyRows} />
        )}
      </section>
    </div>
  );
}
