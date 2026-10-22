/**
 * The registry of permissions and roles of release 1 (ACC-30, DEC-029).
 *
 * One constant holds it. The bootstrap command (ACC-40) makes the database match
 * it, and the services read the roles from it. An authorization check names a
 * permission and never a role (DEC-029).
 *
 * This file is pure.
 */
import { PERMISSION_CODES, type PermissionCode, type RoleCode } from "@/lib/schemas/identity";

export interface RoleDefinition {
  readonly code: RoleCode;
  /** The name in each language of the interface (DEC-011). */
  readonly name: { readonly tr: string; readonly en: string };
  readonly permissions: readonly PermissionCode[];
}

/** Every `catalog.*` and `eifu.*` permission, except `eifu.access_record.view_raw` (ACC-30 rule 4). */
const IFU_MANAGER_PERMISSIONS = [
  "catalog.product.view",
  "catalog.product.manage",
  "catalog.catalog_number.manage",
  "catalog.lot.view",
  "catalog.lot.manage",
  "catalog.lot.correct",
  "eifu.document.view",
  "eifu.document.manage",
  "eifu.document.publish",
  "eifu.document.withdraw",
  "eifu.document.replace_published_file",
  "eifu.lot_override.manage",
  "eifu.access_record.view_aggregated",
] as const satisfies readonly PermissionCode[];

export const IDENTITY_REGISTRY = {
  permissions: PERMISSION_CODES,
  roles: [
    {
      code: "IFU_MANAGER",
      name: { tr: "IFU Yöneticisi", en: "IFU Manager" },
      permissions: IFU_MANAGER_PERMISSIONS,
    },
    {
      code: "PLATFORM_ADMINISTRATOR",
      name: { tr: "Platform Yöneticisi", en: "Platform Administrator" },
      // Every permission of the registry.
      permissions: PERMISSION_CODES,
    },
  ],
} as const satisfies {
  readonly permissions: readonly PermissionCode[];
  readonly roles: readonly RoleDefinition[];
};

/** The role with the code given. Every `RoleCode` is in the registry. */
export function findRole(code: RoleCode): RoleDefinition {
  const role = IDENTITY_REGISTRY.roles.find((candidate) => candidate.code === code);
  if (role === undefined) {
    throw new Error(`The role ${code} is not in the registry.`);
  }
  return role;
}

/** The permissions that a set of role codes gives, sorted and without a duplicate. */
export function permissionsOfRoles(roleCodes: readonly RoleCode[]): PermissionCode[] {
  const held = new Set<PermissionCode>();
  for (const roleCode of roleCodes) {
    for (const permission of findRole(roleCode).permissions) {
      held.add(permission);
    }
  }
  return PERMISSION_CODES.filter((permission) => held.has(permission));
}
