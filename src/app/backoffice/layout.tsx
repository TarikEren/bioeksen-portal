/**
 * The shell of the backoffice (ACC-30.AC1, ACC-50, FND-08, FND-09, stage B1 UI
 * table, mockup of the backoffice shell).
 *
 * A server component. It reads the session and sends a person with no live
 * session to `/sign-in` (the proxy does the same check on the cookie, as an
 * optimistic first step). A user who holds no permission goes to `/no-area`
 * (ACC-50.AC2). The shell has a dark sidebar in the region `.sidebar-theme` of
 * the global stylesheet: the brand block that links to the start page, the
 * language switch, and the navigation in groups. A thin top bar names the group
 * of the open page and holds the user menu with the sign-out. The Users entry
 * shows only with `organization.users.view`, and an entry arrives with its screen
 * (the sidebar of stage B1 holds no other entry). Hiding an entry is not
 * authorization: each page and each service checks the permission again
 * (`sds-nextjs-frontend` §2). A layout does not run again on each navigation
 * inside it, so each page also calls `requireSession`. The first link is the skip
 * link of WCAG 2.4.1.
 */
import { Typography } from "@heroui/react";
import { redirect } from "next/navigation";

import { AppLink } from "@/app/_components/app-link";
import { BrandMark } from "@/app/_components/brand-mark";
import { failureLabels } from "@/app/_components/failure";
import { LanguageControl } from "@/app/_components/language-control";
import { initialsOf } from "@/app/_lib/initials";
import { landingPathFor } from "@/app/_lib/landing";
import { getRequestText, getSession } from "@/app/_lib/request";
import { fmt } from "@/lib/i18n";

import { BackofficeLocation } from "./_components/backoffice-location";
import { BackofficeNav } from "./_components/backoffice-nav";
import { UserMenu } from "./_components/user-menu";
import type { NavGroupView, NavItemView } from "./_lib/nav-groups";

export default async function BackofficeLayout({ children }: LayoutProps<"/backoffice">) {
  const session = await getSession();
  if (session === null) {
    redirect("/sign-in");
  }
  if (landingPathFor(session.user.permissions) === "/no-area") {
    redirect("/no-area");
  }
  const { language, text } = await getRequestText();

  const identityItems: NavItemView[] = [];
  if (session.actor.permissions.has("organization.users.view")) {
    identityItems.push({ href: "/backoffice/users", label: text.backoffice.nav.users });
  }
  const groups: NavGroupView[] =
    identityItems.length > 0 ? [{ label: text.backoffice.nav.groups.identity, items: identityItems }] : [];

  const fullName = `${session.user.firstName} ${session.user.lastName}`;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AppLink
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-surface focus:p-3"
      >
        {text.backoffice.skipToContent}
      </AppLink>
      <aside className="sidebar-theme flex flex-col gap-6 bg-surface p-4 text-surface-foreground lg:w-64 lg:shrink-0">
        <AppLink href="/backoffice" className="flex items-center gap-3 no-underline">
          <BrandMark />
          <div className="flex min-w-0 flex-col">
            <Typography.Paragraph weight="semibold">{text.home.title}</Typography.Paragraph>
            <Typography.Paragraph size="sm">{text.backoffice.brandArea}</Typography.Paragraph>
          </div>
        </AppLink>
        <LanguageControl tone="sidebar" />
        <BackofficeNav ariaLabel={text.backoffice.nav.label} groups={groups} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-separator px-6 py-2">
          <BackofficeLocation groups={groups} fallback={text.backoffice.title} />
          <UserMenu
            name={fullName}
            initials={initialsOf([session.user.firstName, session.user.lastName], language)}
            labels={{
              menu: text.backoffice.userMenu.label,
              trigger: fmt(text.backoffice.userMenu.trigger, { name: fullName }),
              signOut: text.common.signOut,
            }}
            failure={failureLabels(text)}
          />
        </header>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
