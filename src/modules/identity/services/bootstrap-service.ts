/**
 * The work of the bootstrap command (ACC-40, DEC-023).
 *
 * It makes the permissions, the roles and their bundles in the database match
 * the registry (ACC-40 rule 1, ACC-30). While no active Platform Administrator
 * exists, it makes one for the email address given and sends an invitation. It
 * sets and prints no password (ACC-40 rule 2).
 *
 * All of it runs in one transaction. A refusal leaves the database as it was.
 * The command is not a request of a person, so the actor of its audit rows is
 * `SYSTEM`.
 */
import "server-only";

import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { logger } from "@/lib/logging";
import { runTransaction } from "@/lib/transaction";
import { appendAudit } from "@/modules/platform/services/audit-service";
import { queueMail } from "@/modules/platform/services/mail-service";

import { IDENTITY_REGISTRY } from "../domain/registry";
import { findActiveAssignment, findRoleByCode, insertAssignment, syncRegistry } from "../repositories/role-repository";
import { countActiveUsersWithRole, findUserByEmail, insertUser } from "../repositories/user-repository";
import { normalizeEmail } from "./identity-views";
import { issueToken } from "./token-service";

const ADMINISTRATOR_ROLE = "PLATFORM_ADMINISTRATOR";

export interface BootstrapResult {
  /** The rows that the registry sync added or changed. */
  readonly registryChanges: number;
  /** Whether the command made the first administrator. */
  readonly administratorCreated: boolean;
}

/** The refusal of ACC-40.AC2: no administrator exists and no email address was given. The command exits with code 2. */
export class BootstrapRefused extends AppError {
  constructor() {
    super("CFG-5000", CODE_MEANINGS["CFG-5000"], {
      reason: "no active Platform Administrator exists and BOOTSTRAP_ADMIN_EMAIL is not set",
    });
    this.name = "BootstrapRefused";
  }
}

/**
 * Runs the bootstrap.
 *
 * @param adminEmail The value of `BOOTSTRAP_ADMIN_EMAIL`, if it is set.
 * @throws BootstrapRefused when no active Platform Administrator exists and `adminEmail` is not set (ACC-40.AC2).
 */
export async function runBootstrap(adminEmail: string | undefined): Promise<BootstrapResult> {
  const result = await runTransaction(async (tx) => {
    const registryChanges = await syncRegistry(
      tx,
      IDENTITY_REGISTRY.permissions,
      IDENTITY_REGISTRY.roles.map((role) => ({ code: role.code, name: role.name, permissions: role.permissions })),
    );
    const role = await findRoleByCode(tx, ADMINISTRATOR_ROLE);
    if (role === null) {
      throw new AppError("SYS-5000", "Unhandled error", { reason: "the registry sync did not make the administrator role" });
    }
    if ((await countActiveUsersWithRole(tx, role.id)) > 0) {
      return { registryChanges, administratorCreated: false };
    }
    if (adminEmail === undefined) {
      throw new BootstrapRefused();
    }

    const at = now();
    const emailNormalized = normalizeEmail(adminEmail);
    const existing = await findUserByEmail(tx, emailNormalized, true);
    if (existing !== null && !existing.isActive) {
      throw new AppError("RES-4302", CODE_MEANINGS["RES-4302"], { reason: "the account of BOOTSTRAP_ADMIN_EMAIL is inactive" });
    }
    const user =
      existing ??
      (await insertUser(tx, {
        email: adminEmail.trim(),
        emailNormalized,
        firstName: "Platform",
        lastName: "Administrator",
        preferredLanguage: "tr",
        now: at,
      }));
    if (existing === null) {
      await appendAudit(tx, {
        actor: { type: "SYSTEM" },
        actionCode: "identity.user.created",
        entityType: "identity_user",
        entityId: String(user.id),
        stateBefore: null,
        stateAfter: { isActive: true, hasPassword: false, preferredLanguage: user.preferredLanguage },
      });
    }

    if ((await findActiveAssignment(tx, user.id, role.id)) === null) {
      const assignmentId = await insertAssignment(tx, { userId: user.id, roleId: role.id, grantedByUserId: null, now: at });
      await appendAudit(tx, {
        actor: { type: "SYSTEM" },
        actionCode: "identity.role_assignment.granted",
        entityType: "identity_role_assignment",
        entityId: String(assignmentId),
        stateBefore: null,
        stateAfter: { userId: String(user.id), roleCode: ADMINISTRATOR_ROLE, isActive: true },
      });
    }

    // A person who has a password needs no invitation.
    if (user.passwordHash === null) {
      const token = await issueToken(tx, user.id, "INVITATION", null);
      await queueMail(tx, { template: "invitation", to: user.email, language: user.preferredLanguage, token });
    }
    return { registryChanges, administratorCreated: true };
  });

  logger.write({
    severity: "INFO",
    type: "APP",
    message: "bootstrap finished",
    tail: { registry_changes: result.registryChanges, administrator_created: result.administratorCreated },
  });
  return result;
}
