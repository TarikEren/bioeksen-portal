/**
 * The test sign-in of the test seams (FND-03 rule 4): a session for a user, with
 * no password, through the same session store that every entry point reads.
 * It refuses with 404 `RES-4200` unless the seams are open, and for a user who
 * does not exist or is inactive.
 */
import "server-only";

import { isTestSeamEnabled } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { readExecutor } from "@/lib/transaction";

import { findActiveAssignments } from "../repositories/role-repository";
import { openSession } from "../repositories/session-repository";
import { findUserById } from "../repositories/user-repository";
import { parseEntityId, toMe } from "./identity-views";
import type { SignedIn } from "./session-service";

/**
 * Opens a session for a user.
 *
 * @throws AppError `RES-4200` when the seams are closed, or the user is missing or inactive.
 */
export async function openTestSession(userId: string): Promise<SignedIn> {
  if (!isTestSeamEnabled()) {
    throw new AppError("RES-4200", "Resource does not exist", { reason: "the test seams are closed" });
  }
  const executor = readExecutor();
  const key = parseEntityId(userId);
  const user = key === null ? null : await findUserById(executor, key);
  if (user === null || !user.isActive) {
    throw new AppError("RES-4200", "Resource does not exist", {
      reason: "the user of the test sign-in is missing or inactive",
    });
  }
  const sessionId = await openSession(String(user.id));
  return { sessionId, user: toMe(user, await findActiveAssignments(executor, [user.id])) };
}
