/**
 * The files of one version (IFU-20, IFU-32, mockup `DocumentDetailPage` file
 * list).
 *
 * A server component. Each file is a card with its language code, its state, its
 * size, the time of its upload, the name of the upload (information only,
 * IFU-20 rule 5) and its SHA-256 hash, and then its actions. The system keeps a file
 * that a replacement or a removal made inactive (DEC-010, DEC-124), and the list
 * shows it with its state, so that the person sees what was replaced. The list is
 * not a table, because a hash has 64 characters and must stay on one line: a table
 * of 8 columns does not fit at 1024 px beside the sidebar. The hash, the language
 * code and the name of the upload are in IBM Plex Mono (DEC-016) and a long value
 * scrolls inside its own line and never widens the page. A state is an icon and a
 * text (DEC-019). The size and the time go through the project formatters (DEC-133).
 */
import { Card, Chip, Typography } from "@heroui/react";

import { StatusIcon } from "@/app/_components/status-icon";
import { eifuFailureLabels } from "@/app/backoffice/_lib/eifu-failure";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { type Dictionary, type Language, fmt } from "@/lib/i18n";
import type { FileView, VersionStatus } from "@/lib/schemas/eifu";

import { FileActions } from "./file-actions";

interface FileListProps {
  readonly files: readonly FileView[];
  readonly status: VersionStatus;
  readonly can: { readonly manage: boolean; readonly replace: boolean };
  readonly language: Language;
  readonly text: Dictionary;
}

export function FileList({ files, status, can, language, text }: FileListProps) {
  const copy = text.eifu.files;
  if (files.length === 0) {
    return (
      <Card variant="transparent">
        <Card.Content>
          <Typography.Paragraph color="muted" size="sm">
            {copy.empty}
          </Typography.Paragraph>
        </Card.Content>
      </Card>
    );
  }
  const failure = {
    download: eifuFailureLabels(text, "download"),
    deactivate: eifuFailureLabels(text, "deactivateFile"),
    replace: eifuFailureLabels(text, "replace"),
  };
  return (
    <ul aria-label={copy.list} className="flex flex-col gap-4">
      {files.map((file) => {
        const languageName = { language: file.languageCode };
        return (
          <li key={file.id} className="min-w-0">
            <Card>
              <Card.Content className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Typography.Heading level={3} weight="semibold" className="font-mono">
                    {file.languageCode}
                  </Typography.Heading>
                  <Chip size="sm" color="default" variant="secondary">
                    <StatusIcon isActive={file.isActive} />
                    <Chip.Label>{file.isActive ? text.eifu.fileState.active : text.eifu.fileState.inactive}</Chip.Label>
                  </Chip>
                  <span className="text-sm text-muted tabular-nums">{formatFileSize(file.fileSizeBytes, language)}</span>
                  <span className="text-sm text-muted tabular-nums">{formatDateTime(new Date(file.createdAt), language)}</span>
                </div>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                  <dt className="text-muted">{copy.hash}</dt>
                  <dd className="min-w-0 overflow-x-auto font-mono text-xs whitespace-nowrap">{file.fileHash}</dd>
                  <dt className="text-muted">{copy.name}</dt>
                  <dd className="min-w-0 overflow-x-auto font-mono text-xs whitespace-nowrap">
                    {file.originalFilename ?? text.eifu.none}
                  </dd>
                </dl>
                {/* An inactive file keeps its download for the audit trail, and no other action. */}
                <FileActions
                  fileId={file.id}
                  canDeactivate={file.isActive && can.manage && status === "DRAFT"}
                  canReplace={file.isActive && can.replace && (status === "PUBLISHED" || status === "SUPERSEDED")}
                  labels={{
                    download: {
                      ...copy.download,
                      buttonLabel: fmt(copy.download.buttonLabel, languageName),
                    },
                    deactivate: {
                      ...copy.deactivate,
                      buttonLabel: fmt(copy.deactivate.buttonLabel, languageName),
                    },
                    replace: {
                      ...copy.replace,
                      buttonLabel: fmt(copy.replace.buttonLabel, languageName),
                      lede: fmt(copy.replace.lede, languageName),
                    },
                  }}
                  failure={failure}
                />
              </Card.Content>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
