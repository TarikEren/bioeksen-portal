/**
 * Users and invitations (ACC-10).
 *
 * Each function checks the permission of the actor first (DEC-029). A change
 * runs in one transaction: the audit row is in it, and the mail goes out after
 * it commits (PLT-40, DEC-033). An invitation or a deactivation never names the
 * email address in a log record.
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { logger } from "@/lib/logging";
import { now } from "@/lib/clock";
import { type MockUser, endMockSessionsOfUser, identityMock, issueMockToken } from "@/lib/mock/identity";
import { runMockTransaction } from "@/lib/mock/transaction";
import {
  type CreateUserInput,
  type UserDetail,
  type UserListQuery,
  type UserSummary,
} from "@/lib/schemas/identity";
import { appendAudit } from "@/modules/platform/services/audit-service";
import { queueMail } from "@/modules/platform/services/mail-service";

import {
  allUsersInOrder,
  findUserByEmail,
  findUserById,
  normalizeEmail,
  toUserDetail,
  toUserSummary,
} from "./identity-views";

/** A page of `GET users`, in the list body of `sds-api-design`. */
export interface UserListPage {
  readonly page: number;
  readonly count: number;
  readonly totalCount: number;
  readonly users: readonly UserSummary[];
  readonly filterParams: UserListQuery;
}

function notFound(): AppError {
  return new AppError("RES-4200", CODE_MEANINGS["RES-4200"]);
}

/** The user with the id given, or 404. A malformed id is a missing user. */
function requireUser(id: string): MockUser {
  const user = findUserById(id);
  if (user === null) {
    throw notFound();
  }
  return user;
}

/**
 * Lists the users, one page, in the order of the ids (ACC-10 rule 5).
 *
 * @throws AppError `PERM-4150` without `organization.users.view`.
 */
// MOCK: ACC-10
export async function listUsers(actor: SessionActor, query: UserListQuery): Promise<UserListPage> {
  requirePermission(actor, "organization.users.view");
  const needle = query.q === null ? null : query.q.toLowerCase();
  const matching = allUsersInOrder().filter(
    (user) =>
      needle === null ||
      `${user.email} ${user.firstName} ${user.lastName}`.toLowerCase().includes(needle),
  );
  const start = (query.page - 1) * query.limit;
  const users = matching.slice(start, start + query.limit).map(toUserSummary);
  return Promise.resolve({
    page: query.page,
    count: users.length,
    totalCount: matching.length,
    users,
    filterParams: query,
  });
}

/**
 * Creates a user with no password and sends one invitation after the commit
 * (ACC-10.AC1). The creation has one audit row.
 *
 * @throws AppError `PERM-4150` without `organization.users.manage`; `RES-4300`
 * when the email address belongs to a user, in any letter case (ACC-10.AC2).
 */
// MOCK: ACC-10
export async function createUser(actor: SessionActor, input: CreateUserInput): Promise<UserDetail> {
  requirePermission(actor, "organization.users.manage");
  if (findUserByEmail(input.email) !== null) {
    throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the email address belongs to a user" });
  }
  return runMockTransaction(async (tx) => {
    const state = identityMock();
    const id = String(state.nextUserId++);
    const at = now();
    const user: MockUser = {
      id,
      email: normalizeEmail(input.email),
      firstName: input.firstName,
      lastName: input.lastName,
      preferredLanguage: input.preferredLanguage,
      isActive: true,
      hasPassword: false,
      createdAt: at,
      updatedAt: at,
    };
    state.users.set(id, user);
    const token = issueMockToken(id, "INVITATION");
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.user.created",
      entityType: "identity_user",
      entityId: id,
      stateBefore: null,
      stateAfter: { isActive: true, hasPassword: false, preferredLanguage: user.preferredLanguage },
    });
    await queueMail(tx, { template: "invitation", to: user.email, language: user.preferredLanguage, token });
    return toUserDetail(user);
  });
}

/**
 * One user with the active roles.
 *
 * @throws AppError `PERM-4150` without `organization.users.view`; `RES-4200`.
 */
// MOCK: ACC-10
export async function getUser(actor: SessionActor, id: string): Promise<UserDetail> {
  requirePermission(actor, "organization.users.view");
  return Promise.resolve(toUserDetail(requireUser(id)));
}

/**
 * Sends a new invitation. The earlier link ends (ACC-10.AC6). The invitation
 * has one audit row.
 *
 * @throws AppError `PERM-4150` without `organization.users.manage`; `RES-4200`;
 * `RES-4302` when the user has a password, or the account is inactive.
 */
// MOCK: ACC-10
export async function reinviteUser(actor: SessionActor, id: string): Promise<void> {
  requirePermission(actor, "organization.users.manage");
  const user = requireUser(id);
  if (user.hasPassword || !user.isActive) {
    throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], {
      reason: user.hasPassword ? "the user has a password" : "the account is inactive",
    });
  }
  await runMockTransaction(async (tx) => {
    const token = issueMockToken(user.id, "INVITATION");
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.user.invited",
      entityType: "identity_user",
      entityId: user.id,
      stateBefore: null,
      stateAfter: { hasPassword: false },
    });
    await queueMail(tx, { template: "invitation", to: user.email, language: user.preferredLanguage, token });
  });
}

/**
 * Deactivates a user. Each session of the user ends, and the row stays
 * (ACC-10.AC7, DEC-010). The deactivation has one audit row.
 *
 * @throws AppError `PERM-4150` without `organization.users.manage`, and for the
 * actor's own account (ACC-10.AC8); `RES-4200`; `RES-4302` when inactive.
 */
// MOCK: ACC-10
export async function deactivateUser(actor: SessionActor, id: string): Promise<void> {
  requirePermission(actor, "organization.users.manage");
  if (id === actor.userId) {
    throw new AppError("PERM-4150", CODE_MEANINGS["PERM-4150"], { reason: "the actor deactivates the own account" });
  }
  const user = requireUser(id);
  if (!user.isActive) {
    throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the account is inactive" });
  }
  await runMockTransaction(async (tx) => {
    user.isActive = false;
    user.updatedAt = now();
    endMockSessionsOfUser(user.id);
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.user.deactivated",
      entityType: "identity_user",
      entityId: user.id,
      stateBefore: { isActive: true },
      stateAfter: { isActive: false },
    });
  });
  logger.write({ severity: "INFO", type: "SECURITY", message: "sessions of a deactivated user ended", tail: { sub: user.id } });
}
