/**
 * The backoffice start page (ACC-50.AC1, FND-09.AC4).
 *
 * A server component. It shows a welcome with the name of the user and the areas
 * that the permissions of the user open (`areasOpenedBy`), as in the mockup of
 * the start page. An area with a page is a card that is a link as a whole.
 * An area with no page yet says that it opens in a later stage, in a text and not
 * by color alone (DEC-019). Showing an area is not authorization: the services
 * check the permission with the data (`sds-nextjs-frontend` §2).
 */
import { Card, Typography } from "@heroui/react";
import type { Metadata } from "next";

import { AppLink } from "@/app/_components/app-link";
import { getRequestText, requireSession } from "@/app/_lib/request";
import { fmt } from "@/lib/i18n";

import { areasOpenedBy } from "./_lib/areas";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.backoffice.title };
}

export default async function BackofficeStartPage() {
  const session = await requireSession();
  const { text } = await getRequestText();
  const areas = areasOpenedBy(session.user.permissions);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Typography.Heading level={1} weight="semibold">
          {fmt(text.backoffice.welcome, { name: `${session.user.firstName} ${session.user.lastName}` })}
        </Typography.Heading>
        <Typography.Paragraph color="muted" size="sm">
          {text.backoffice.intro}
        </Typography.Paragraph>
      </div>
      <section aria-labelledby="areas-title" className="flex flex-col gap-3">
        <Typography.Heading level={2} weight="semibold" id="areas-title">
          {text.backoffice.areasTitle}
        </Typography.Heading>
        <ul className="grid gap-4 sm:grid-cols-2">
          {areas.map((area) => {
            const copy = text.backoffice.areas[area.key];
            return (
              <li key={area.key} className="min-w-0">
                <Card className="relative h-full">
                  <Card.Header>
                    <Card.Title>
                      {area.href === null ? (
                        copy.title
                      ) : (
                        // The pseudo-element stretches the link over the whole card, so the card is the target.
                        <AppLink href={area.href} className="after:absolute after:inset-0">
                          {copy.title}
                        </AppLink>
                      )}
                    </Card.Title>
                    <Card.Description>{copy.description}</Card.Description>
                  </Card.Header>
                  {area.href === null ? (
                    <Card.Content>
                      <Typography.Paragraph color="muted" size="sm">
                        {text.backoffice.areaPending}
                      </Typography.Paragraph>
                    </Card.Content>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
