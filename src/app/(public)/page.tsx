/**
 * The public entry page (FND-08, FND-09, ACC-50 rule 3, stage B1 UI table, mockup
 * of the landing page).
 *
 * It shows the public header (brand and language switch), the heading
 * `home.title` with a short introduction, and two cards: the public lookup of the
 * instructions for use (`/eifu`, IFU-70 rule 1, stage B4) and the sign-in (stage
 * B1). The lookup comes first, because most visitors have no account. The server
 * component reads the dictionary of the active language. The page is dynamic
 * because it reads the language cookie (see the root layout). The links are
 * `AppButtonLink`: `Button` has no `href`, and a link is the right element for a
 * navigation (`sds-nextjs-frontend` §5, R-059).
 */
import { Card, Typography } from "@heroui/react";

import { AppButtonLink } from "@/app/_components/app-button-link";
import { PublicHeader } from "@/app/_components/public-header";
import { getRequestText } from "@/app/_lib/request";

export default async function PublicHomePage() {
  const { text } = await getRequestText();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 p-6">
      <PublicHeader />
      <div className="flex flex-col gap-2">
        <Typography.Heading level={1} weight="semibold" className="min-w-0">
          {text.home.title}
        </Typography.Heading>
        <Typography.Paragraph color="muted">{text.home.intro}</Typography.Paragraph>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <Card.Header>
            <Card.Title>{text.home.lookupTitle}</Card.Title>
            <Card.Description>{text.home.lookupDescription}</Card.Description>
          </Card.Header>
          <Card.Footer>
            <AppButtonLink href="/eifu">{text.home.lookup}</AppButtonLink>
          </Card.Footer>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{text.home.signInTitle}</Card.Title>
            <Card.Description>{text.home.signInDescription}</Card.Description>
          </Card.Header>
          <Card.Footer>
            <AppButtonLink href="/sign-in" variant="secondary">
              {text.home.signIn}
            </AppButtonLink>
          </Card.Footer>
        </Card>
      </div>
    </main>
  );
}
