/**
 * The previous and next links of a catalog list (`sds-api-design`, **Lists**).
 *
 * A composition of `AppLink`s. The page number and the filters are in the URL,
 * so a link opens the same view (`sds-nextjs-frontend` §7). The links keep the
 * other query values. It shows nothing when the list has one page. A server
 * component, as the pagination of the user list is.
 */
import { Typography } from "@heroui/react";

import { AppLink } from "@/app/_components/app-link";
import { fmt } from "@/lib/i18n";

interface PaginationNavProps {
  readonly basePath: string;
  /** The other query values of the view, with no `page`. */
  readonly params: Readonly<Record<string, string>>;
  readonly name: string;
  readonly page: number;
  readonly limit: number;
  readonly totalCount: number;
  readonly labels: {
    readonly label: string;
    readonly previous: string;
    readonly next: string;
    /** A template with the placeholder `{page}`. */
    readonly page: string;
  };
}

function hrefOf(basePath: string, params: Readonly<Record<string, string>>, name: string, page: number): string {
  const query = new URLSearchParams(params);
  query.set(name, String(page));
  return `${basePath}?${query.toString()}`;
}

export function PaginationNav({ basePath, params, name, page, limit, totalCount, labels }: PaginationNavProps) {
  const hasPrevious = page > 1;
  const hasNext = page * limit < totalCount;
  if (!hasPrevious && !hasNext) {
    return null;
  }
  return (
    <nav aria-label={labels.label} className="flex flex-wrap items-center gap-4">
      {hasPrevious ? <AppLink href={hrefOf(basePath, params, name, page - 1)}>{labels.previous}</AppLink> : null}
      <Typography.Paragraph color="muted" size="sm">
        {fmt(labels.page, { page })}
      </Typography.Paragraph>
      {hasNext ? <AppLink href={hrefOf(basePath, params, name, page + 1)}>{labels.next}</AppLink> : null}
    </nav>
  );
}
