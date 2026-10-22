/**
 * The tables `identity_permission`, `identity_role`, `identity_role_permission`
 * and `identity_role_assignment` (ACC-30, ACC-31). It holds queries and nothing
 * else. A role assignment is never deleted (DEC-010): a revocation sets
 * `is_active` to false.
 */
import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";

export interface RoleRow {
  readonly id: bigint;
  readonly code: string;
}

/** One assignment with the code of its role. */
export interface AssignmentRow {
  readonly id: bigint;
  readonly userId: bigint;
  readonly roleId: bigint;
  readonly roleCode: string;
  readonly isActive: boolean;
  readonly grantedByUserId: bigint | null;
  readonly grantedAt: Date;
  readonly revokedByUserId: bigint | null;
  readonly revokedAt: Date | null;
}

interface StoredAssignment {
  readonly id: bigint;
  readonly userId: bigint;
  readonly roleId: bigint;
  readonly isActive: boolean;
  readonly grantedByUserId: bigint | null;
  readonly grantedAt: string;
  readonly revokedByUserId: bigint | null;
  readonly revokedAt: string | null;
  readonly role: { readonly code: string } | null;
}

function toAssignmentRow(row: StoredAssignment): AssignmentRow {
  if (row.role === null) {
    throw new Error("The store holds an assignment without a role");
  }
  return {
    id: row.id,
    userId: row.userId,
    roleId: row.roleId,
    roleCode: row.role.code,
    isActive: row.isActive,
    grantedByUserId: row.grantedByUserId,
    grantedAt: fromColumnInstant(row.grantedAt),
    revokedByUserId: row.revokedByUserId,
    revokedAt: row.revokedAt === null ? null : fromColumnInstant(row.revokedAt),
  };
}

export async function findRoleByCode(executor: Executor, code: string): Promise<RoleRow | null> {
  const row = await executor.orm.public.IdentityRole.where({ code }).first();
  return row === null ? null : { id: row.id, code: row.code };
}

/** The active assignments of the users, with the code of each role, in the order of the ids. */
export async function findActiveAssignments(executor: Executor, userIds: readonly bigint[]): Promise<AssignmentRow[]> {
  if (userIds.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.IdentityRoleAssignment.where((assignment) =>
    and(assignment.userId.in([...userIds]), assignment.isActive.eq(true)),
  )
    .include("role")
    .orderBy((assignment) => assignment.id.asc())
    .all();
  return rows.map(toAssignmentRow);
}

/** The active assignment of a user and a role, or `null`. */
export async function findActiveAssignment(
  executor: Executor,
  userId: bigint,
  roleId: bigint,
): Promise<AssignmentRow | null> {
  const row = await executor.orm.public.IdentityRoleAssignment.where((assignment) =>
    and(assignment.userId.eq(userId), assignment.roleId.eq(roleId), assignment.isActive.eq(true)),
  )
    .include("role")
    .first();
  return row === null ? null : toAssignmentRow(row);
}

/** One assignment by its id, with the code of its role. */
export async function findAssignmentById(executor: Executor, id: bigint): Promise<AssignmentRow | null> {
  const row = await executor.orm.public.IdentityRoleAssignment.where({ id }).include("role").first();
  return row === null ? null : toAssignmentRow(row);
}

export interface NewAssignment {
  readonly userId: bigint;
  readonly roleId: bigint;
  /** The granter. `null` for the bootstrap command (ACC-40). */
  readonly grantedByUserId: bigint | null;
  readonly now: Date;
}

/**
 * Inserts an active assignment and returns its id. The partial unique index
 * fails with `23505` when the user holds the role already.
 */
export async function insertAssignment(executor: Executor, assignment: NewAssignment): Promise<bigint> {
  const row = await executor.orm.public.IdentityRoleAssignment.create({
    userId: assignment.userId,
    roleId: assignment.roleId,
    isActive: true,
    grantedByUserId: assignment.grantedByUserId,
    grantedAt: toColumnInstant(assignment.now),
    revokedByUserId: null,
    revokedAt: null,
  });
  return row.id;
}

/** Ends an assignment. The row stays (DEC-010, ACC-31.AC4). */
export async function markAssignmentRevoked(
  executor: Executor,
  id: bigint,
  revokedByUserId: bigint,
  now: Date,
): Promise<void> {
  await executor.orm.public.IdentityRoleAssignment.where({ id }).update({
    isActive: false,
    revokedByUserId,
    revokedAt: toColumnInstant(now),
  });
}

export interface RegistryRole {
  readonly code: string;
  readonly name: { readonly tr: string; readonly en: string };
  readonly permissions: readonly string[];
}

/** Whether a stored role name is the name of the registry. */
function isSameName(stored: unknown, name: RegistryRole["name"]): boolean {
  return (
    typeof stored === "object" &&
    stored !== null &&
    !Array.isArray(stored) &&
    Reflect.get(stored, "tr") === name.tr &&
    Reflect.get(stored, "en") === name.en
  );
}

/**
 * Makes the permissions, the roles and their bundles match the registry
 * (ACC-40 rule 1, ACC-30). It adds what is missing and updates the name of a
 * role. It removes nothing: a permission or a bundle that the registry no longer
 * holds stays until a person decides about it, because a role assignment is a
 * controlled record (DEC-010).
 *
 * @returns The number of rows that it added or changed. A second run gives 0 (ACC-40.AC4).
 */
export async function syncRegistry(
  executor: Executor,
  permissionCodes: readonly string[],
  roles: readonly RegistryRole[],
): Promise<number> {
  let changes = 0;
  const permissionIds = new Map<string, bigint>();
  for (const row of await executor.orm.public.IdentityPermission.all()) {
    permissionIds.set(row.code, row.id);
  }
  for (const code of permissionCodes) {
    if (!permissionIds.has(code)) {
      const created = await executor.orm.public.IdentityPermission.create({ code });
      permissionIds.set(code, created.id);
      changes += 1;
    }
  }

  for (const role of roles) {
    const name = { tr: role.name.tr, en: role.name.en };
    const existing = await executor.orm.public.IdentityRole.where({ code: role.code }).first();
    let roleId: bigint;
    if (existing === null) {
      roleId = (await executor.orm.public.IdentityRole.create({ code: role.code, name })).id;
      changes += 1;
    } else {
      roleId = existing.id;
      if (!isSameName(existing.name, role.name)) {
        await executor.orm.public.IdentityRole.where({ id: roleId }).update({ name });
        changes += 1;
      }
    }

    const held = new Set((await executor.orm.public.IdentityRolePermission.where({ roleId }).all()).map((row) => row.permissionId));
    for (const permissionCode of role.permissions) {
      const permissionId = permissionIds.get(permissionCode);
      if (permissionId === undefined) {
        throw new Error("A role of the registry names a permission that the registry does not hold");
      }
      if (!held.has(permissionId)) {
        await executor.orm.public.IdentityRolePermission.create({ roleId, permissionId });
        changes += 1;
      }
    }
  }
  return changes;
}
