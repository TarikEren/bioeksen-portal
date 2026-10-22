/**
 * What the two commands of the worker share (PLT-30, ACC-40).
 *
 * `main.ts` and `bootstrap.ts` export a function and also run when node starts
 * the bundle of the file. A test imports the function and runs nothing.
 */
import "server-only";

import { pathToFileURL } from "node:url";

import { getConfigState } from "@/lib/config";
import { logger } from "@/lib/logging";

/** Whether the module at `moduleUrl` is the file that node was started with. */
export function isEntryModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === moduleUrl;
}

/**
 * Checks the configuration, as the app does when it starts (FND-03 rule 3). A
 * command that cannot read its settings writes one `FATAL` record for each of
 * them, and the caller ends with exit code 1.
 *
 * @returns `true` when the configuration is usable.
 */
export function checkConfiguration(): boolean {
  const state = getConfigState();
  if (state.status === "ready") {
    return true;
  }
  for (const issue of state.issues) {
    logger.failure(issue.code, { tail: { setting: issue.setting, reason: issue.reason } });
  }
  return false;
}

/** The longest time that a command waits for its records to reach the store before it ends. */
const FLUSH_LIMIT_MS = 10_000;

/**
 * Ends the command: waits for the log records, then sets the exit code. The
 * process ends by itself when no handle is left. The timer is a guard for a
 * handle that stays.
 */
export async function finish(exitCode: number): Promise<void> {
  await Promise.race([logger.flush(), new Promise<void>((resolve) => setTimeout(resolve, FLUSH_LIMIT_MS).unref())]);
  process.exitCode = exitCode;
  setTimeout(() => process.exit(exitCode), FLUSH_LIMIT_MS).unref();
}
