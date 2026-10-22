/**
 * The section *Documents* of the product page (IFU-10 *Screens*, stage B3 UI
 * table, mockup `ProductDocuments`).
 *
 * A server component. It lists the documents of the product with the version in
 * force today and its state, and links each document to its page. "New document"
 * shows with `eifu.document.manage` and opens the form with this product chosen. The
 * page shows the section only to a holder of `eifu.document.view`; showing a link is
 * not authorization (`sds-nextjs-frontend` §2). A document number and a revision
 * label are in IBM Plex Mono (DEC-016), and a date goes through the project
 * formatter (DEC-133). A state is an icon and a text (DEC-019). It is a
 * composition of HeroUI parts.
 */
import { Card, Typography } from "@heroui/react";

import { AppButtonLink } from "@/app/_components/app-button-link";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { VersionStatusChip } from "@/app/backoffice/_components/version-status-chip";
import { formatBusinessDate } from "@/lib/format";
import { type Dictionary, type Language, fmt } from "@/lib/i18n";
import type { DocumentSummary } from "@/lib/schemas/eifu";

interface ProductDocumentsSectionProps {
  readonly productId: string;
  readonly documents: readonly DocumentSummary[];
  readonly canManage: boolean;
  readonly language: Language;
  readonly text: Dictionary;
}

export function ProductDocumentsSection({ productId, documents, canManage, language, text }: ProductDocumentsSectionProps) {
  const copy = text.eifu.productDocuments;
  const columns: DataTableColumn[] = [
    { key: "number", label: copy.columns.number, isRowHeader: true, cellClassName: "font-mono break-all" },
    { key: "title", label: copy.columns.title, cellClassName: "break-words" },
    { key: "inForce", label: copy.columns.inForce },
    { key: "versions", label: copy.columns.versions, cellClassName: "tabular-nums" },
  ];
  const rows: DataTableRow[] = documents.map((document) => ({
    id: document.id,
    href: `/backoffice/documents/${document.id}`,
    cells: {
      number: document.documentNumber,
      title: document.title[language],
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

  return (
    <section aria-labelledby="product-documents-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Typography.Heading level={2} weight="semibold" id="product-documents-title">
          {copy.title}
        </Typography.Heading>
        {canManage ? (
          <AppButtonLink href={`/backoffice/documents/new?productId=${encodeURIComponent(productId)}`} variant="secondary">
            {copy.newDocument}
          </AppButtonLink>
        ) : null}
      </div>
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
    </section>
  );
}
