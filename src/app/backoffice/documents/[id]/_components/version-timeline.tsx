/**
 * The versions of one document as a timeline (IFU-10 *Screens*, IFU-30, mockup
 * `DocumentDetailPage`).
 *
 * A server component. Each version shows its revision label, its state, its
 * period and the number of its active files, and links to its page. The list is
 * sorted by the start of the period, the latest first, and the drafts, which have
 * no period, come first. It never marks a version as "current": a lookup resolves
 * the version whose period holds the manufacturing date of the LOT, and the newest
 * version is often the wrong one (DEC-061). The period is half-open, and the page
 * says so once. A revision label and a date are in IBM Plex Mono (DEC-016); a date
 * goes through the project formatter (DEC-133). A state is an icon and a text
 * (DEC-019). The line at the left is a border of the `separator` token. This is a
 * composition of HeroUI parts.
 */
import { Card, Typography } from "@heroui/react";

import { AppLink } from "@/app/_components/app-link";
import { VersionStatusChip } from "@/app/backoffice/_components/version-status-chip";
import { periodText } from "@/app/backoffice/_lib/period-text";
import { formatBusinessDate } from "@/lib/format";
import { type Dictionary, type Language, fmt } from "@/lib/i18n";
import type { VersionSummary } from "@/lib/schemas/eifu";

interface VersionTimelineProps {
  readonly documentId: string;
  readonly versions: readonly VersionSummary[];
  readonly language: Language;
  readonly text: Dictionary;
}

/** The drafts first, newest first, then the versions with a period by the start of the period, latest first. */
function timelineOrder(versions: readonly VersionSummary[]): readonly VersionSummary[] {
  return [...versions].sort((left, right) => {
    if (left.period === null || right.period === null) {
      if (left.period === right.period) {
        return Number(right.id) - Number(left.id);
      }
      return left.period === null ? -1 : 1;
    }
    return right.period.effectiveFrom.localeCompare(left.period.effectiveFrom) || Number(right.id) - Number(left.id);
  });
}

export function VersionTimeline({ documentId, versions, language, text }: VersionTimelineProps) {
  const copy = text.eifu.document.versions;
  if (versions.length === 0) {
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
  return (
    <ol aria-label={copy.list} className="flex flex-col gap-4 border-s border-separator ps-4">
      {timelineOrder(versions).map((version) => (
        <li key={version.id} className="min-w-0">
          <Card>
            <Card.Content className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Typography.Heading level={3} weight="semibold">
                  {/* The link is the heading, so its name holds the revision and a list of links is not a list of "open". */}
                  <AppLink href={`/backoffice/documents/${documentId}/versions/${version.id}`}>
                    {text.eifu.version.revisionLabel} <span className="font-mono break-all">{version.revision}</span>
                  </AppLink>
                </Typography.Heading>
                <VersionStatusChip status={version.status} label={text.eifu.status[version.status]} />
              </div>
              <p className="font-mono">
                {version.period === null ? (
                  <span className="font-sans text-muted">{copy.noPeriod}</span>
                ) : (
                  periodText(version.period, text.eifu.period, language)
                )}
              </p>
              {version.period !== null && version.period.withdrawnAt !== null ? (
                <p className="text-sm text-muted">{text.eifu.period.withdrawn}</p>
              ) : null}
              {version.status === "DRAFT" && version.proposedEffectiveFrom !== null ? (
                <p className="text-sm text-muted">
                  {copy.proposedStart}:{" "}
                  <span className="font-mono">{formatBusinessDate(version.proposedEffectiveFrom, language)}</span>
                </p>
              ) : null}
              <p className="text-sm text-muted">{fmt(copy.files, { count: version.fileCount })}</p>
            </Card.Content>
          </Card>
        </li>
      ))}
    </ol>
  );
}
