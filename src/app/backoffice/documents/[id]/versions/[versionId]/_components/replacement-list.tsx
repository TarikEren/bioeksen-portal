/**
 * The replacements of the files of one version (IFU-32.AC1, DEC-065).
 *
 * A server component. Each replacement shows the language of the file, the time,
 * the hash of the old file and the hash of the new one, and the reason. The
 * system never deletes a replacement row (DEC-010), so the list is the record of
 * every correction of a published file. The list is not a table, for the reason
 * that `file-list.tsx` gives: two hashes of 64 characters must stay on one line. The
 * language code and the hashes are in IBM Plex Mono (DEC-016), and the time goes
 * through the project formatter (DEC-133). The reason is record content, not copy.
 */
import { Card, Typography } from "@heroui/react";

import { formatDateTime } from "@/lib/format";
import type { Dictionary, Language } from "@/lib/i18n";
import type { ReplacementView } from "@/lib/schemas/eifu";

interface ReplacementListProps {
  readonly replacements: readonly ReplacementView[];
  readonly language: Language;
  readonly text: Dictionary;
}

export function ReplacementList({ replacements, language, text }: ReplacementListProps) {
  const copy = text.eifu.replacements;
  if (replacements.length === 0) {
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
    <ul aria-label={copy.list} className="flex flex-col gap-4">
      {replacements.map((replacement) => (
        <li key={replacement.id} className="min-w-0">
          <Card>
            <Card.Content>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="text-muted">{copy.language}</dt>
                <dd className="font-mono">{replacement.languageCode}</dd>
                <dt className="text-muted">{copy.replacedAt}</dt>
                <dd className="tabular-nums">{formatDateTime(new Date(replacement.replacedAt), language)}</dd>
                <dt className="text-muted">{copy.previousHash}</dt>
                <dd className="min-w-0 overflow-x-auto font-mono text-xs whitespace-nowrap">
                  {replacement.previousFileHash}
                </dd>
                <dt className="text-muted">{copy.newHash}</dt>
                <dd className="min-w-0 overflow-x-auto font-mono text-xs whitespace-nowrap">
                  {replacement.replacementFileHash}
                </dd>
                <dt className="text-muted">{copy.reason}</dt>
                <dd className="min-w-0 break-words">{replacement.reason}</dd>
              </dl>
            </Card.Content>
          </Card>
        </li>
      ))}
    </ul>
  );
}
