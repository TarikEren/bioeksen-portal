/**
 * A link between the pages of the app (`sds-nextjs-frontend` §5).
 *
 * It is a composition: the `Link` of Next.js, so that the router prefetches and
 * navigates on the client, dressed with the class of HeroUI's `Link` through
 * `linkVariants` of `@heroui/styles`, as the HeroUI documentation says for a
 * routing library. HeroUI's own `Link` navigates with a full page load unless a
 * router provider is set, and the app has one provider only (the locale
 * provider). The component is neutral: a server component and a client
 * component both render it.
 */
import { linkVariants } from "@heroui/styles";
import NextLink from "next/link";
import type { ReactNode } from "react";

interface AppLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** Marks the link of the page that is open. The mark is `aria-current`, never the color alone (DEC-019). */
  readonly isCurrent?: boolean;
}

export function AppLink({ href, children, className, isCurrent = false }: AppLinkProps) {
  return (
    <NextLink
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={linkVariants().base({ className })}
    >
      {children}
    </NextLink>
  );
}
