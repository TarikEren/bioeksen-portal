/**
 * The grouped navigation of the backoffice shell (ACC-30, stage B1 UI table).
 *
 * The sidebar groups its entries by the job a person came to do, and the thin top
 * bar names the group of the page that is open. The server builds the groups
 * from the permissions of the session and the text of the dictionary, and passes
 * them as data. An entry arrives with its screen and never before. In stage B1
 * the one group is Identity, and its one entry is Users
 * (`organization.users.view`). Hiding an entry is not authorization: each page
 * and each service checks the permission again (`sds-nextjs-frontend` §2). This
 * file is pure, so the server layout and the client components share it.
 */
export interface NavItemView {
  readonly href: string;
  readonly label: string;
}

export interface NavGroupView {
  readonly label: string;
  readonly items: readonly NavItemView[];
}

/** `true` when the path is the page of the entry or lies under it. */
export function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The group whose entry holds the open path, or `null` for a page with no entry (the start page). */
export function groupOfPath(pathname: string, groups: readonly NavGroupView[]): NavGroupView | null {
  return groups.find((group) => group.items.some((item) => isUnder(pathname, item.href))) ?? null;
}
