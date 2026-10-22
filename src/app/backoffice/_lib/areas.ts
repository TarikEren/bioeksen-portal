/**
 * The areas of the backoffice and the permission that opens each one (ACC-50
 * rule 2, ACC-30 rule 3).
 *
 * The start page lists the areas that the permissions of the user open, and the
 * navigation lists the areas that have a page. In stage B1 only `users` has a
 * page. The other areas have no page yet, so their `href` is `null` and the
 * start page says that the area opens in a later stage. A later stage gives the
 * area its `href`. This is display only: the services check the permission with
 * the data, and hiding a link is not authorization (`sds-nextjs-frontend` §2).
 * This file is pure.
 */
import type { Dictionary } from "@/lib/i18n";
import type { PermissionCode } from "@/lib/schemas/identity";

/** The keys of `backoffice.areas` in the dictionary. A missing text fails the type check. */
export type AreaKey = keyof Dictionary["backoffice"]["areas"];

export interface AreaDefinition {
  readonly key: AreaKey;
  /** The permission that opens the area. */
  readonly permission: PermissionCode;
  /** The page of the area, or `null` while the area has no page. */
  readonly href: string | null;
}

export const AREAS = [
  { key: "users", permission: "organization.users.view", href: "/backoffice/users" },
  { key: "catalog", permission: "catalog.product.view", href: null },
  { key: "documents", permission: "eifu.document.view", href: null },
  { key: "reports", permission: "eifu.access_record.view_aggregated", href: null },
] as const satisfies readonly AreaDefinition[];

/** The areas that a set of permissions opens, in the order of `AREAS`. */
export function areasOpenedBy(permissions: readonly PermissionCode[]): readonly AreaDefinition[] {
  return AREAS.filter((area) => permissions.includes(area.permission));
}
