/**
 * The reads that the identity services share, and the views of the answers.
 *
 * In stage B1 step 2 these read the mock state. Step 4 moves them to the
 * repositories of the module, and the views stay as they are.
 */
import "server-only";

import { type MockRoleAssignment, type MockUser, identityMock } from "@/lib/mock/identity";
import {
  EntityId,
  type Me,
  type RoleAssignmentView,
  type RoleCode,
  type UserDetail,
  type UserSummary,
} from "@/lib/schemas/identity";

import { findRole, permissionsOfRoles } from "../domain/registry";

/** The form of an email address that the store compares: no outer space, lower case (ACC-10.AC2). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The user with the id given, or `null` for an id of a wrong form or a missing user. */
// MOCK: ACC-10
export function findUserById(id: string): MockUser | null {
  if (!EntityId.safeParse(id).success) {
    return null;
  }
  return identityMock().users.get(id) ?? null;
}

// MOCK: ACC-10
export function findUserByEmail(email: string): MockUser | null {
  const wanted = normalizeEmail(email);
  for (const user of identityMock().users.values()) {
    if (normalizeEmail(user.email) === wanted) {
      return user;
    }
  }
  return null;
}

/** The users in the order of their ids. The order is total, so two pages never swap rows. */
// MOCK: ACC-10
export function allUsersInOrder(): MockUser[] {
  return [...identityMock().users.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

// MOCK: ACC-31
export function activeAssignmentsOf(userId: string): MockRoleAssignment[] {
  return identityMock().assignments.filter((assignment) => assignment.userId === userId && assignment.isActive);
}

// MOCK: ACC-31
export function activeRoleCodes(userId: string): RoleCode[] {
  return activeAssignmentsOf(userId).map((assignment) => assignment.roleCode);
}

/** The signed-in user. The permissions come from the active assignments now, so a revocation counts at once (ACC-30.AC4). */
export function toMe(user: MockUser): Me {
  const roles = activeRoleCodes(user.id);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    preferredLanguage: user.preferredLanguage,
    permissions: permissionsOfRoles(roles),
    roles,
  };
}

export function toUserSummary(user: MockUser): UserSummary {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    preferredLanguage: user.preferredLanguage,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    activeRoles: activeRoleCodes(user.id).map((code) => ({ code, name: findRole(code).name })),
  };
}

export function toAssignmentView(assignment: MockRoleAssignment): RoleAssignmentView {
  return {
    id: assignment.id,
    roleCode: assignment.roleCode,
    roleName: findRole(assignment.roleCode).name,
    isActive: assignment.isActive,
    grantedByUserId: assignment.grantedByUserId,
    grantedAt: assignment.grantedAt.toISOString(),
    revokedAt: assignment.revokedAt === null ? null : assignment.revokedAt.toISOString(),
  };
}

/** One user with the active roles (`GET users/{id}`). */
export function toUserDetail(user: MockUser): UserDetail {
  return {
    ...toUserSummary(user),
    hasPassword: user.hasPassword,
    updatedAt: user.updatedAt.toISOString(),
    roles: activeAssignmentsOf(user.id).map(toAssignmentView),
  };
}
