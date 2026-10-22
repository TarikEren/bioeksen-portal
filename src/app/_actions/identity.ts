"use server";

/**
 * The server actions of the identity pages (stage B1 contract, ACC-10, ACC-11,
 * ACC-20, ACC-31).
 *
 * A server action is a public POST endpoint, so each one validates its argument
 * and calls the same service as the route handler of the same operation. The
 * service checks the permission with the data. Next.js compares `Origin` with
 * the host (FND-07 rule 3). Each action answers the envelope of
 * `sds-api-design`: `{ status: "ok", … }` or `{ status: "fail", code, message,
 * details }`.
 *
 * An action that needs a session reads the cookie `bp_session` and answers 401
 * `AUTH-4100` without one. The pages send the person to `/sign-in`.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { clearSessionCookie, setSessionCookie } from "@/lib/auth/session-cookie";
import type { ActionResult } from "@/lib/errors";
import { parseWith, runAction } from "@/lib/http";
import {
  CreateUserInput,
  EntityId,
  GrantRoleInput,
  type Me,
  PasswordResetRequestInput,
  type RoleAssignmentView,
  RoleCode,
  SetPasswordInput,
  SignInInput,
  type UserDetail,
} from "@/lib/schemas/identity";
import { requireCurrentActor, requireCurrentSession } from "@/modules/identity/current-actor";
import {
  acceptInvitation,
  completePasswordReset,
  requestPasswordReset,
} from "@/modules/identity/services/credential-service";
import { grantRole, revokeRole } from "@/modules/identity/services/role-service";
import { signIn, signOut } from "@/modules/identity/services/session-service";
import { createUser, deactivateUser, reinviteUser } from "@/modules/identity/services/user-service";

const UserIdArgument = z.strictObject({ id: EntityId });
const RoleArgument = z.strictObject({ id: EntityId, roleCode: RoleCode });

/** Signs in and sets the cookie. The page sends the person to `/backoffice` or `/no-area` from `user.permissions` (ACC-50). */
export async function signInAction(input: SignInInput): Promise<ActionResult<{ user: Me }>> {
  return runAction("signIn", async () => {
    const body = parseWith(SignInInput, input);
    const { sessionId, user } = await signIn(body, { forwardedFor: (await headers()).get("x-forwarded-for") });
    await setSessionCookie(sessionId);
    return { status: "ok", user };
  });
}

/** Ends the session and clears the cookie. */
export async function signOutAction(): Promise<ActionResult> {
  return runAction("signOut", async () => {
    const { actor } = await requireCurrentSession();
    await signOut(actor.sessionId);
    await clearSessionCookie();
    return { status: "ok" };
  });
}

/** Creates a user and sends one invitation (`organization.users.manage`). */
export async function createUserAction(input: CreateUserInput): Promise<ActionResult<{ user: UserDetail }>> {
  return runAction("createUser", async () => {
    const body = parseWith(CreateUserInput, input);
    const user = await createUser(await requireCurrentActor(), body);
    revalidatePath("/backoffice/users");
    return { status: "ok", user };
  });
}

/** Sends a new invitation (`organization.users.manage`). */
export async function reinviteUserAction(id: string): Promise<ActionResult> {
  return runAction("reinviteUser", async () => {
    const argument = parseWith(UserIdArgument, { id });
    await reinviteUser(await requireCurrentActor(), argument.id);
    revalidatePath(`/backoffice/users/${argument.id}`);
    return { status: "ok" };
  });
}

/** Deactivates a user (`organization.users.manage`). */
export async function deactivateUserAction(id: string): Promise<ActionResult> {
  return runAction("deactivateUser", async () => {
    const argument = parseWith(UserIdArgument, { id });
    await deactivateUser(await requireCurrentActor(), argument.id);
    revalidatePath("/backoffice/users");
    revalidatePath(`/backoffice/users/${argument.id}`);
    return { status: "ok" };
  });
}

/** Grants a role (`iam.role.manage`). */
export async function grantRoleAction(
  id: string,
  input: GrantRoleInput,
): Promise<ActionResult<{ roleAssignment: RoleAssignmentView }>> {
  return runAction("grantRole", async () => {
    const argument = parseWith(UserIdArgument, { id });
    const body = parseWith(GrantRoleInput, input);
    const roleAssignment = await grantRole(await requireCurrentActor(), argument.id, body.roleCode);
    revalidatePath(`/backoffice/users/${argument.id}`);
    return { status: "ok", roleAssignment };
  });
}

/** Revokes a role (`iam.role.manage`). */
export async function revokeRoleAction(
  id: string,
  roleCode: RoleCode,
): Promise<ActionResult<{ roleAssignment: RoleAssignmentView }>> {
  return runAction("revokeRole", async () => {
    const argument = parseWith(RoleArgument, { id, roleCode });
    const roleAssignment = await revokeRole(await requireCurrentActor(), argument.id, argument.roleCode);
    revalidatePath(`/backoffice/users/${argument.id}`);
    return { status: "ok", roleAssignment };
  });
}

/** Sets the password from an invitation link. The token comes from the URL fragment (DEC-138). */
export async function acceptInvitationAction(input: SetPasswordInput): Promise<ActionResult> {
  return runAction("acceptInvitation", async () => {
    await acceptInvitation(parseWith(SetPasswordInput, input));
    return { status: "ok" };
  });
}

/** Asks for a password reset. The answer is the same for every email address (ACC-11.AC1). */
export async function requestPasswordResetAction(input: PasswordResetRequestInput): Promise<ActionResult> {
  return runAction("requestPasswordReset", async () => {
    await requestPasswordReset(parseWith(PasswordResetRequestInput, input));
    return { status: "ok" };
  });
}

/** Sets the new password from a reset link. The token comes from the URL fragment (DEC-138). */
export async function completePasswordResetAction(input: SetPasswordInput): Promise<ActionResult> {
  return runAction("completePasswordReset", async () => {
    await completePasswordReset(parseWith(SetPasswordInput, input));
    return { status: "ok" };
  });
}
