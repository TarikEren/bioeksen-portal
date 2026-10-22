/**
 * The full consent text with its version and the draft marker (IFU-70 rule 2,
 * IFU-70.AC1, AC2, DEC-074, DEC-098).
 *
 * It shows the text at the place where the visitor gives consent: consent to a
 * text that a person cannot read from where they give it is not informed. While
 * the text is a draft, a warning `Alert` says so (the legal function writes the
 * final text, DEC-074). The text and its version come from the dictionary and
 * from `EIFU_LEGAL_NOTICE_VERSION`. It is a composition of HeroUI's `Card`,
 * `Alert` and `Typography`, and it has no state, so a server component and a
 * client component both render it.
 */
import { Alert, Card, Typography } from "@heroui/react";

import { fmt } from "@/lib/i18n/messages";

import type { LookupCopy } from "../_lib/lookup-copy";

interface ConsentNoticeProps {
  readonly copy: LookupCopy["notice"];
  /** The value of `EIFU_LEGAL_NOTICE_VERSION`. */
  readonly version: string;
}

export function ConsentNotice({ copy, version }: ConsentNoticeProps) {
  const sections = [copy.collected, copy.purpose, copy.retention, copy.rights, copy.withdraw];

  return (
    <Card variant="secondary">
      <Card.Content className="flex flex-col gap-3">
        <Typography.Heading level={3} weight="semibold">
          {copy.title}
        </Typography.Heading>
        <Typography.Paragraph color="muted" size="sm">
          {fmt(copy.version, { version })}
        </Typography.Paragraph>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{copy.draft}</Alert.Title>
          </Alert.Content>
        </Alert>
        <Typography.Paragraph size="sm">{copy.intro}</Typography.Paragraph>
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <Typography.Heading level={4} weight="semibold">
              {section.title}
            </Typography.Heading>
            <Typography.Paragraph size="sm">{section.body}</Typography.Paragraph>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
