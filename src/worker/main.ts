/**
 * The worker process (PLT-30, DEC-008).
 *
 * It runs one pass each hour, and the first pass when it starts. A PostgreSQL
 * advisory lock lets only one worker instance run a pass at a time
 * (PLT-30.AC1). `SIGTERM` and `SIGINT` end the process after the pass that runs.
 * The jobs are in `./jobs.ts`.
 */
import "server-only";

import { setTimeout as sleep } from "node:timers/promises";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging";
import { runPass } from "@/modules/platform/services/job-service";

import { checkConfiguration, finish, isEntryModule } from "./entry";
import { JOBS } from "./jobs";

/** One pass each hour (DEC-008). */
const PASS_INTERVAL_MS = 60 * 60 * 1000;

/** Runs one pass. A failure of the pass is logged, and the next pass tries again. */
async function pass(): Promise<void> {
  try {
    await runPass(JOBS);
  } catch (error) {
    logger.failure(error instanceof AppError ? error.code : "JOB-5000", { tail: { step: "pass" }, error });
  }
}

/**
 * Runs the passes until the process gets a signal to stop.
 *
 * @param intervalMs The time between two passes. Tests give a short one.
 * @param signal Ends the loop.
 */
export async function main(intervalMs: number = PASS_INTERVAL_MS, signal: AbortSignal = new AbortController().signal): Promise<void> {
  logger.write({ severity: "INFO", type: "JOB", message: "worker started", tail: { jobs: JOBS.length } });
  while (!signal.aborted) {
    await pass();
    try {
      await sleep(intervalMs, undefined, { signal });
    } catch {
      // The signal ended the wait.
    }
  }
  logger.write({ severity: "INFO", type: "JOB", message: "worker stopped" });
}

if (isEntryModule(import.meta.url)) {
  if (!checkConfiguration()) {
    void finish(1);
  } else {
    const stop = new AbortController();
    process.once("SIGTERM", () => stop.abort());
    process.once("SIGINT", () => stop.abort());
    void main(PASS_INTERVAL_MS, stop.signal).then(() => finish(0));
  }
}
