/**
 * What the process does when it starts (FND-03 rule 3, `sds-config`, **When it
 * is validated**).
 *
 * It reads the configuration once. For each setting that is not set or not
 * usable it writes one `FATAL` record with `CFG-5000` or `CFG-5001`. The record
 * names the setting and never its value. It does not end the process: the app
 * stays up, `GET /api/health/ready` answers 503, and every other route answers
 * 503 `SYS-5500` (`FATAL` logs and returns; `sds-logging`, **Bindings**).
 */
import "server-only";

import { getConfigState } from "@/lib/config";
import { logger } from "@/lib/logging";

/** Checks the configuration and writes the records of the start. */
export function reportStartup(): void {
  const state = getConfigState();
  if (state.status === "failed") {
    for (const issue of state.issues) {
      logger.failure(issue.code, { tail: { setting: issue.setting, reason: issue.reason } });
    }
    return;
  }
  logger.write({
    severity: "INFO",
    type: "APP",
    message: "application started",
    tail: { app_env: state.config.APP_ENV },
  });
}
