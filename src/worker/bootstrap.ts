/**
 * The bootstrap command, `pnpm run bootstrap` (ACC-40).
 *
 * It makes the permissions, the roles and their bundles in the database match
 * the registry (ACC-30), and, while no active Platform Administrator exists, it
 * makes one for `BOOTSTRAP_ADMIN_EMAIL` and sends the invitation. It runs on
 * every release, after the migrations (ACC-40 rule 1). It prints no password and
 * no email address.
 *
 * Exit codes: 0 done; 1 the command failed; 2 no active Platform Administrator
 * exists and `BOOTSTRAP_ADMIN_EMAIL` is not set, and no user changed (ACC-40.AC2).
 */
import "server-only";

import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging";
import { BootstrapRefused, runBootstrap } from "@/modules/identity/services/bootstrap-service";

import { checkConfiguration, finish, isEntryModule } from "./entry";

export type BootstrapExitCode = 0 | 1 | 2;

/** Runs the bootstrap and returns the exit code. It never throws. */
export async function bootstrap(): Promise<BootstrapExitCode> {
  if (!checkConfiguration()) {
    return 1;
  }
  try {
    await runBootstrap(getConfig().BOOTSTRAP_ADMIN_EMAIL);
    return 0;
  } catch (error) {
    if (error instanceof BootstrapRefused) {
      logger.failure(error.code, { tail: { command: "bootstrap", reason: error.reason ?? "refused" } });
      return 2;
    }
    const code = error instanceof AppError ? error.code : "SYS-5000";
    logger.failure(code, { tail: { command: "bootstrap", ...(error instanceof AppError && error.reason !== null ? { reason: error.reason } : {}) }, error });
    return 1;
  }
}

if (isEntryModule(import.meta.url)) {
  void bootstrap().then(finish);
}
