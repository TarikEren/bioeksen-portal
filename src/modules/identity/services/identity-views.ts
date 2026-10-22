/**
 * The views of the answers, built from the rows of the repositories, and the
 * small rules that the identity services share.
 *
 * A view holds no password hash and no token (`sds-nextjs-backend` §3).
 */
import "server-only";

import {
  EntityId,
  type Me,
  RoleCode,
  type RoleAssignmentView,
  type UserDetail,
  type UserSummary,
} from "@/lib/schemas/identity";

import { findRole, permissionsOfRoles } from "../domain/registry";
import type { AssignmentRow } from "../repositories/role-repository";
import type { UserRow } from "../repositories/user-repository";

/** The form of an email address that the store compares: no outer space, lower case (ACC-10.AC2). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The `bigint` key of a text id, or `null` for an id of a wrong form (a malformed id names no record). */
export function parseEntityId(id: string): bigint | null {
  return EntityId.safeParse(id).success ? BigInt(id) : null;
}

/** The code of a role as the registry knows it. A database that holds another code is a defect of the store. */
function toRoleCode(code: string): RoleCode {
  return RoleCode.parse(code);
}

/** The role codes of the assignments of one user, in the order of the assignments. */
function roleCodesOf(userId: bigint, assignments: readonly AssignmentRow[]): RoleCode[] {
  return assignments.filter((assignment) => assignment.userId === userId).map((assignment) => toRoleCode(assignment.roleCode));
}

/** The signed-in user. The permissions come from the active assignments, so a revocation counts at once (ACC-30.AC4). */
export function toMe(user: UserRow, activeAssignments: readonly AssignmentRow[]): Me {
  const roles = roleCodesOf(user.id, activeAssignments);
  return {
    id: String(user.id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    preferredLanguage: user.preferredLanguage,
    permissions: permissionsOfRoles(roles),
    roles,
  };
}

export function toUserSummary(user: UserRow, activeAssignments: readonly AssignmentRow[]): UserSummary {
  return {
    id: String(user.id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    preferredLanguage: user.preferredLanguage,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    activeRoles: roleCodesOf(user.id, activeAssignments).map((code) => ({ code, name: findRole(code).name })),
  };
}

export function toAssignmentView(assignment: AssignmentRow): RoleAssignmentView {
  const roleCode = toRoleCode(assignment.roleCode);
  return {
    id: String(assignment.id),
    roleCode,
    roleName: findRole(roleCode).name,
    isActive: assignment.isActive,
    grantedByUserId: assignment.grantedByUserId === null ? null : String(assignment.grantedByUserId),
    grantedAt: assignment.grantedAt.toISOString(),
    revokedAt: assignment.revokedAt === null ? null : assignment.revokedAt.toISOString(),
  };
}

/** One user with the active role assignments (`GET users/{id}`). */
export function toUserDetail(user: UserRow, activeAssignments: readonly AssignmentRow[]): UserDetail {
  return {
    ...toUserSummary(user, activeAssignments),
    hasPassword: user.passwordHash !== null,
    updatedAt: user.updatedAt.toISOString(),
    roles: activeAssignments.filter((assignment) => assignment.userId === user.id).map(toAssignmentView),
  };
}
