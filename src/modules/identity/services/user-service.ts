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
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { logger } from "@/lib/logging";
import {
  type CreateUserInput,
  type UserDetail,
  type UserListQuery,
  type UserSummary,
} from "@/lib/schemas/identity";
import { type Executor, readExecutor, runTransaction } from "@/lib/transaction";
import { appendAudit } from "@/modules/platform/services/audit-service";
import { queueMail } from "@/modules/platform/services/mail-service";

import { findActiveAssignments } from "../repositories/role-repository";
import { endSessionsOfUser } from "../repositories/session-repository";
import {
  type UserRow,
  findUserByEmail,
  findUserById,
  insertUser,
  listUsers as listUserRows,
  markUserInactive,
} from "../repositories/user-repository";
import { normalizeEmail, parseEntityId, toUserDetail, toUserSummary } from "./identity-views";
import { issueToken } from "./token-service";

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

/** The user with the id given, or 404. A malformed id is a missing user. `lock` locks the row for the transaction. */
async function requireUser(executor: Executor, id: string, lock = false): Promise<UserRow> {
  const key = parseEntityId(id);
  const user = key === null ? null : await findUserById(executor, key, lock);
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
export async function listUsers(actor: SessionActor, query: UserListQuery): Promise<UserListPage> {
  requirePermission(actor, "organization.users.view");
  const page = await listUserRows({ page: query.page, limit: query.limit, search: query.q });
  const assignments = await findActiveAssignments(
    readExecutor(),
    page.rows.map((row) => row.id),
  );
  const users = page.rows.map((row) => toUserSummary(row, assignments));
  return { page: query.page, count: users.length, totalCount: page.totalCount, users, filterParams: query };
}

/**
 * Creates a user with no password and sends one invitation after the commit
 * (ACC-10.AC1). The creation has one audit row, `identity.user.created`. The
 * first invitation is part of the creation and writes no row of its own
 * (ACC-10 rule 6).
 *
 * @throws AppError `PERM-4150` without `organization.users.manage`; `RES-4300`
 * when the email address belongs to a user, in any letter case (ACC-10.AC2).
 */
export async function createUser(actor: SessionActor, input: CreateUserInput): Promise<UserDetail> {
  requirePermission(actor, "organization.users.manage");
  const actorId = BigInt(actor.userId);
  const email = input.email.trim();
  const emailNormalized = normalizeEmail(email);
  return runTransaction(async (tx) => {
    // A second creation with the same address between this check and the insert
    // fails on the unique index of `email_normalized` with the same `RES-4300`.
    if ((await findUserByEmail(tx, emailNormalized)) !== null) {
      throw new AppError("RES-4300", CODE_MEANINGS["RES-4300"], { reason: "the email address belongs to a user" });
    }
    const user = await insertUser(tx, {
      email,
      emailNormalized,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredLanguage: input.preferredLanguage,
      now: now(),
    });
    const token = await issueToken(tx, user.id, "INVITATION", actorId);
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.user.created",
      entityType: "identity_user",
      entityId: String(user.id),
      stateBefore: null,
      stateAfter: { isActive: true, hasPassword: false, preferredLanguage: user.preferredLanguage },
    });
    await queueMail(tx, { template: "invitation", to: user.email, language: user.preferredLanguage, token });
    return toUserDetail(user, []);
  });
}

/**
 * One user with the active roles.
 *
 * @throws AppError `PERM-4150` without `organization.users.view`; `RES-4200`.
 */
export async function getUser(actor: SessionActor, id: string): Promise<UserDetail> {
  requirePermission(actor, "organization.users.view");
  const executor = readExecutor();
  const user = await requireUser(executor, id);
  return toUserDetail(user, await findActiveAssignments(executor, [user.id]));
}

/**
 * Sends a new invitation. The earlier link ends (ACC-10.AC6). The invitation
 * has one audit row, `identity.user.invited`.
 *
 * @throws AppError `PERM-4150` without `organization.users.manage`; `RES-4200`;
 * `RES-4302` when the user has a password, or the account is inactive.
 */
export async function reinviteUser(actor: SessionActor, id: string): Promise<void> {
  requirePermission(actor, "organization.users.manage");
  await runTransaction(async (tx) => {
    const user = await requireUser(tx, id, true);
    if (user.passwordHash !== null || !user.isActive) {
      throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], {
        reason: user.passwordHash !== null ? "the user has a password" : "the account is inactive",
      });
    }
    const token = await issueToken(tx, user.id, "INVITATION", BigInt(actor.userId));
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.user.invited",
      entityType: "identity_user",
      entityId: String(user.id),
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
export async function deactivateUser(actor: SessionActor, id: string): Promise<void> {
  requirePermission(actor, "organization.users.manage");
  if (id === actor.userId) {
    throw new AppError("PERM-4150", CODE_MEANINGS["PERM-4150"], { reason: "the actor deactivates the own account" });
  }
  await runTransaction(async (tx) => {
    const user = await requireUser(tx, id, true);
    if (!user.isActive) {
      throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the account is inactive" });
    }
    await markUserInactive(tx, user.id, now());
    await appendAudit(tx, {
      actor: { type: "USER", userId: actor.userId },
      actionCode: "identity.user.deactivated",
      entityType: "identity_user",
      entityId: String(user.id),
      stateBefore: { isActive: true },
      stateAfter: { isActive: false },
    });
    // After the commit: a rollback must leave the sessions. A session that stays
    // after a failure here ends at its next request, because that request reads
    // the user and finds it inactive (`getSessionUser`).
    tx.afterCommit(async () => {
      await endSessionsOfUser(String(user.id));
      logger.write({ severity: "INFO", type: "SECURITY", message: "sessions of a deactivated user ended", tail: { sub: String(user.id) } });
    });
  });
}
