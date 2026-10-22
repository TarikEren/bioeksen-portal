/**
 * The page that a signed-in person reaches first (ACC-50, DEC-026).
 *
 * A user who holds any permission reaches the backoffice start page (ACC-50.AC1).
 * A user who holds none reaches the page "no area yet" (ACC-50.AC2). This file is
 * pure, so the sign-in form (a client component) and the server pages share it.
 */
import type { PermissionCode } from "@/lib/schemas/identity";

export type LandingPath = "/backoffice" | "/no-area";

export function landingPathFor(permissions: readonly PermissionCode[]): LandingPath {
  return permissions.length > 0 ? "/backoffice" : "/no-area";
}
