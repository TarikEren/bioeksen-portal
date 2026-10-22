/**
 * Roles and role assignments (ACC-30, ACC-31, DEC-029, DEC-030).
 *
 * Only a holder of `iam.role.manage` grants or revokes a role. Nobody grants a
 * role to themselves. A revoked assignment stays with `isActive` false
 * (DEC-010). Each grant and each revocation has one audit row in its
 * transaction (PLT-40).
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { type MockRoleAssignment, identityMock } from "@/lib/mock/identity";
import { runTransaction } from "@/lib/transaction";
import type { RoleAssignmentView, RoleCode, RoleView } from "@/lib/schemas/identity";
import { appendAudit } from "@/modules/platform/services/audit-service";

import { IDENTITY_REGISTRY } from "../domain/registry";
import { toAssignmentView, findUserById } from "./identity-views";

/**
 * The roles of the registry with their permissions.
 *
 * @throws AppError `PERM-4150` without `iam.role.manage`.
 */
export async function listRoles(actor: SessionActor): Promise<readonly RoleView[]> {
  requirePermission(actor, "iam.role.manage");
  return Promise.resolve(
    IDENTITY_REGISTRY.roles.map((role) => ({
      code: role.code,
      name: { ...role.name },
      permissions: [...role.permissions],
    })),
  );
}

function activeAssignment(userId: string, roleCode: RoleCode): MockRoleAssignment | undefined {
  return identityMock().assignments.find(
    (assignment) => assignment.userId === userId && assignment.roleCode === roleCode && assignment.isActive,
  );
}

/**
 * Grants a role to another active user (ACC-31.AC1).
 *
 * @throws AppError `PERM-4150` without `iam.role.manage` (AC5) and for the
 * actor's own account, also for a Platform Administrator (AC2); `RES-4200` for
 * a missing user; `RES-4302` for an inactive user; `RES-4300` when the user
 * holds the role (AC3).
 */
// MOCK: ACC-31
export async function grantRole(actor: SessionActor, userId: string, roleCode: RoleCode): Promise<RoleAssignmentView> {
  requirePermission(actor, "iam.role.manage");
  if (userId === actor.userId) {
    throw new AppError("PERM-4150", CODE_MEANINGS["PERM-4150"], { reason: "the actor grants a role to the own account" });
  }
  const user = findUserById(userId);
  if (user === null) {
    throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
  }
  if (!user.isActive) {
    throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the account is inactive" });
  }
  if (activeAssignment(user.id, roleCode) !== undefined) {
    throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the user holds the role" });
  }
  return runTransaction(async (tx) => {
    const state = identityMock();
    const assignment: MockRoleAssignment = {
      id: String(state.nextAssignmentId++),
      userId: user.id,
      roleCode,
      isActive: true,
      grantedByUserId: actor.userId,
      grantedAt: now(),
      revokedByUserId: null,
      revokedAt: null,
    };
    state.assignments.push(assignment);
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.role_assignment.granted",
      entityType: "identity_role_assignment",
      entityId: assignment.id,
      stateBefore: null,
      stateAfter: { userId: user.id, roleCode, isActive: true },
    });
    return toAssignmentView(assignment);
  });
}

/**
 * Revokes a role. The assignment stays with `isActive` false (ACC-31.AC4). The
 * next request of the user no longer has the permissions of the role (ACC-30.AC4).
 *
 * @throws AppError `PERM-4150` without `iam.role.manage`; `RES-4200` when the
 * user has no active assignment of the role.
 */
// MOCK: ACC-31
export async function revokeRole(actor: SessionActor, userId: string, roleCode: RoleCode): Promise<RoleAssignmentView> {
  requirePermission(actor, "iam.role.manage");
  const user = findUserById(userId);
  const assignment = user === null ? undefined : activeAssignment(user.id, roleCode);
  if (user === null || assignment === undefined) {
    throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
  }
  return runTransaction(async (tx) => {
    assignment.isActive = false;
    assignment.revokedByUserId = actor.userId;
    assignment.revokedAt = now();
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.role_assignment.revoked",
      entityType: "identity_role_assignment",
      entityId: assignment.id,
      stateBefore: { userId: user.id, roleCode, isActive: true },
      stateAfter: { userId: user.id, roleCode, isActive: false },
    });
    return toAssignmentView(assignment);
  });
}
