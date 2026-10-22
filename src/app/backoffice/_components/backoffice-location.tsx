"use client";

/**
 * The group of the open page, in the thin top bar of the backoffice shell
 * (stage B1 UI table).
 *
 * The page below has its own heading, so the bar names the group and not the
 * section: nothing else states the group once the page has scrolled. A page that
 * belongs to no group, the start page, shows the fallback text. A client
 * component because it reads the path with `usePathname`; its props are the
 * groups as data and one text.
 */
import { usePathname } from "next/navigation";

import { type NavGroupView, groupOfPath } from "../_lib/nav-groups";

interface BackofficeLocationProps {
  readonly groups: readonly NavGroupView[];
  /** The text for a page with no group. */
  readonly fallback: string;
}

export function BackofficeLocation({ groups, fallback }: BackofficeLocationProps) {
  const pathname = usePathname();
  const group = groupOfPath(pathname, groups);

  return <span className="min-w-0 truncate text-sm text-muted">{group === null ? fallback : group.label}</span>;
}
