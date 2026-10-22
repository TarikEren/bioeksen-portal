"use client";

/**
 * The navigation of the backoffice sidebar (ACC-30, ACC-50).
 *
 * A client component because it marks the page that is open with `usePathname`.
 * The server decides which groups and entries the user sees and passes them as
 * data with their text (`nav-groups.ts`). Each group has a visible label, and the
 * entries of the group are a list named by that label. The open page gets
 * `aria-current="page"`, a heavier weight and a raised fill, so the mark is not
 * the color alone (DEC-019). The fill is a token that `.sidebar-theme` redeclares.
 * The links are `AppLink`s, so the router navigates on the client.
 */
import { usePathname } from "next/navigation";
import { useId } from "react";

import { AppLink } from "@/app/_components/app-link";

import { type NavGroupView, isUnder } from "../_lib/nav-groups";

interface BackofficeNavProps {
  /** The accessible name of the navigation. */
  readonly ariaLabel: string;
  readonly groups: readonly NavGroupView[];
}

export function BackofficeNav({ ariaLabel, groups }: BackofficeNavProps) {
  const pathname = usePathname();
  const idBase = useId();

  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-4">
      {groups.map((group, index) => {
        const labelId = `${idBase}-group-${index}`;
        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p id={labelId} className="px-3 text-xs font-semibold">
              {group.label}
            </p>
            <ul aria-labelledby={labelId} className="flex flex-wrap gap-1 lg:flex-col">
              {group.items.map((item) => {
                const current = isUnder(pathname, item.href);
                return (
                  <li key={item.href}>
                    <AppLink
                      href={item.href}
                      isCurrent={current}
                      className={
                        current
                          ? "block bg-surface-secondary px-3 py-2 font-semibold no-underline"
                          : "block px-3 py-2 no-underline hover:underline"
                      }
                    >
                      {item.label}
                    </AppLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
