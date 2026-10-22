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
import type { RoleAssignmentView, RoleCode, RoleView } from "@/lib/schemas/identity";
import { type Executor, runTransaction } from "@/lib/transaction";
import { appendAudit } from "@/modules/platform/services/audit-service";

import { IDENTITY_REGISTRY } from "../domain/registry";
import {
  type AssignmentRow,
  type RoleRow,
  findActiveAssignment,
  findAssignmentById,
  findRoleByCode,
  insertAssignment,
  markAssignmentRevoked,
} from "../repositories/role-repository";
import { type UserRow, findUserById } from "../repositories/user-repository";
import { parseEntityId, toAssignmentView } from "./identity-views";

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

/** The user with the id, locked for the transaction, or 404. A malformed id is a missing user. */
async function requireUser(executor: Executor, userId: string): Promise<UserRow> {
  const key = parseEntityId(userId);
  const user = key === null ? null : await findUserById(executor, key, true);
  if (user === null) {
    throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
  }
  return user;
}

/**
 * The row of a role of the registry. `bootstrap` puts the registry in the
 * database (ACC-40 rule 1), so a role that is missing there is a defect of the
 * release, not of the request.
 */
async function requireRole(executor: Executor, roleCode: RoleCode): Promise<RoleRow> {
  const role = await findRoleByCode(executor, roleCode);
  if (role === null) {
    throw new AppError("SYS-5000", "Unhandled error", { reason: "the role of the registry is not in the database: bootstrap did not run" });
  }
  return role;
}

/**
 * Grants a role to another active user (ACC-31.AC1).
 *
 * @throws AppError `PERM-4150` without `iam.role.manage` (AC5) and for the
 * actor's own account, also for a Platform Administrator (AC2); `RES-4200` for
 * a missing user; `RES-4302` for an inactive user; `RES-4300` when the user
 * holds the role (AC3).
 */
export async function grantRole(actor: SessionActor, userId: string, roleCode: RoleCode): Promise<RoleAssignmentView> {
  requirePermission(actor, "iam.role.manage");
  if (userId === actor.userId) {
    throw new AppError("PERM-4150", CODE_MEANINGS["PERM-4150"], { reason: "the actor grants a role to the own account" });
  }
  return runTransaction(async (tx) => {
    const user = await requireUser(tx, userId);
    if (!user.isActive) {
      throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the account is inactive" });
    }
    const role = await requireRole(tx, roleCode);
    // Two grants at once: the second one fails on the partial unique index of the
    // active assignment with the same `RES-4300`.
    if ((await findActiveAssignment(tx, user.id, role.id)) !== null) {
      throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the user holds the role" });
    }
    const assignmentId = await insertAssignment(tx, {
      userId: user.id,
      roleId: role.id,
      grantedByUserId: BigInt(actor.userId),
      now: now(),
    });
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.role_assignment.granted",
      entityType: "identity_role_assignment",
      entityId: String(assignmentId),
      stateBefore: null,
      stateAfter: { userId: String(user.id), roleCode, isActive: true },
    });
    const assignment = await findAssignmentById(tx, assignmentId);
    if (assignment === null) {
      throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "the assignment that was inserted is not there" });
    }
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
export async function revokeRole(actor: SessionActor, userId: string, roleCode: RoleCode): Promise<RoleAssignmentView> {
  requirePermission(actor, "iam.role.manage");
  return runTransaction(async (tx) => {
    const user = await requireUser(tx, userId);
    const role = await findRoleByCode(tx, roleCode);
    const assignment: AssignmentRow | null = role === null ? null : await findActiveAssignment(tx, user.id, role.id);
    if (assignment === null) {
      throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
    }
    const at = now();
    await markAssignmentRevoked(tx, assignment.id, BigInt(actor.userId), at);
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.role_assignment.revoked",
      entityType: "identity_role_assignment",
      entityId: String(assignment.id),
      stateBefore: { userId: String(user.id), roleCode, isActive: true },
      stateAfter: { userId: String(user.id), roleCode, isActive: false },
    });
    return toAssignmentView({ ...assignment, isActive: false, revokedByUserId: BigInt(actor.userId), revokedAt: at });
  });
}
