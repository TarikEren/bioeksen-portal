/**
 * The notice of a backoffice page that the user may not open (ACC-30 rule 2).
 *
 * A page shows it when the session lacks the permission of the page. The service
 * would refuse the call with `PERM-4150` anyway: this notice only spares the
 * person an error screen (`sds-nextjs-frontend` §2). It is a composition of
 * HeroUI `Typography` parts with text that the page reads from the dictionary.
 */
import { Typography } from "@heroui/react";

interface ForbiddenNoticeProps {
  readonly title: string;
  readonly body: string;
}

export function ForbiddenNotice({ title, body }: ForbiddenNoticeProps) {
  return (
    <div className="flex flex-col gap-1">
      <Typography.Heading level={1} weight="semibold">
        {title}
      </Typography.Heading>
      <Typography.Paragraph color="muted" size="sm">
        {body}
      </Typography.Paragraph>
    </div>
  );
}
