/**
 * The frame of a single-purpose page outside the backoffice: sign-in, the
 * invitation, the password reset and "no area yet" (ACC-10, ACC-11, ACC-50, stage
 * B1 UI table, mockup of the sign-in).
 *
 * It is a composition of HeroUI parts: the public header (brand and language
 * switch, FND-08), then one `Card` that holds the page title as the level 1
 * heading, a muted description, and the content of the page. The title and the
 * description come from the dictionary, read by the page. The frame is narrow on
 * purpose: one form, one task. A server component.
 */
import { Card, Typography } from "@heroui/react";
import type { ReactNode } from "react";

import { PublicHeader } from "./public-header";

interface PageFrameProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

export function PageFrame({ title, description, children }: PageFrameProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <PublicHeader />
      <Card>
        <Card.Content className="flex flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <Typography.Heading level={1} weight="semibold">
              {title}
            </Typography.Heading>
            {description === undefined ? null : (
              <Typography.Paragraph color="muted" size="sm">
                {description}
              </Typography.Paragraph>
            )}
          </div>
          {children}
        </Card.Content>
      </Card>
    </main>
  );
}
