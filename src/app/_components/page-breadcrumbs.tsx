"use client";

/**
 * The breadcrumbs of a backoffice page (`sds-nextjs-frontend` §8).
 *
 * HeroUI's `Breadcrumbs` is a collection component, so a client wrapper takes
 * the trail as data. The last entry has no `href` and is the current page. The
 * accessible name comes from the dictionary. This is a composition of HeroUI
 * parts.
 */
import { Breadcrumbs } from "@heroui/react";

export interface BreadcrumbEntry {
  readonly label: string;
  /** Absent for the current page. */
  readonly href?: string;
}

interface PageBreadcrumbsProps {
  readonly ariaLabel: string;
  readonly trail: readonly BreadcrumbEntry[];
}

export function PageBreadcrumbs({ ariaLabel, trail }: PageBreadcrumbsProps) {
  return (
    <Breadcrumbs aria-label={ariaLabel}>
      {trail.map((entry) => (
        <Breadcrumbs.Item key={entry.label} href={entry.href}>
          {entry.label}
        </Breadcrumbs.Item>
      ))}
    </Breadcrumbs>
  );
}
