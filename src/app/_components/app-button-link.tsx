/**
 * A link that looks like a button, for a navigation between pages
 * (`sds-nextjs-frontend` §5, R-059).
 *
 * It is a composition: the `Link` of Next.js, so that the router prefetches and
 * navigates on the client, dressed with the class of HeroUI's `Button` through
 * `buttonVariants` of `@heroui/styles`, as `AppLink` does with `linkVariants`.
 * HeroUI's `Button` has no `href`, and a GET form around a submit button makes a
 * screen reader announce a button where the page offers a link. The component is
 * neutral: a server component and a client component both render it.
 */
import { buttonVariants } from "@heroui/styles";
import NextLink from "next/link";
import type { ReactNode } from "react";

interface AppButtonLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  /** The look of the button. The default is the primary action. */
  readonly variant?: "primary" | "secondary" | "tertiary" | "outline" | "ghost";
}

export function AppButtonLink({ href, children, variant = "primary" }: AppButtonLinkProps) {
  return (
    <NextLink href={href} className={buttonVariants({ variant, className: "no-underline" })}>
      {children}
    </NextLink>
  );
}
