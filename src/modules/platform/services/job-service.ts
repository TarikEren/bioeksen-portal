/**
 * The pass of the scheduled jobs (PLT-30, DEC-008).
 *
 * A pass runs under the advisory lock, so when two instances start a pass at the
 * same time only one runs the jobs (PLT-30.AC1). Each job logs its start, its
 * end and its failure as `JOB`. A failed job gets `JOB-5000` and does not stop
 * the other jobs of the pass (PLT-30.AC2). A failure of the lock or the database
 * is a failure of the pass: the next pass tries again.
 */
import "server-only";

import { logger } from "@/lib/logging";

import { withPassLock } from "../repositories/job-lock-repository";

/** One scheduled job. The name is a fixed phrase for the log record. */
export interface Job {
  readonly name: string;
  run(): Promise<void>;
}

export interface PassResult {
  /** `false` when another instance held the lock and this one ran nothing. */
  readonly ran: boolean;
  readonly failedJobs: number;
}

async function runJob(job: Job): Promise<boolean> {
  logger.write({ severity: "INFO", type: "JOB", message: "job started", tail: { job: job.name } });
  try {
    await job.run();
    logger.write({ severity: "INFO", type: "JOB", message: "job ended", tail: { job: job.name } });
    return true;
  } catch (error) {
    logger.failure("JOB-5000", { tail: { job: job.name }, error });
    return false;
  }
}

/**
 * Runs one pass.
 *
 * @throws AppError A failure of the lock or the database. The jobs do not throw.
 */
export async function runPass(jobs: readonly Job[]): Promise<PassResult> {
  const outcome = await withPassLock(async () => {
    logger.write({ severity: "INFO", type: "JOB", message: "pass started", tail: { jobs: jobs.length } });
    let failedJobs = 0;
    for (const job of jobs) {
      if (!(await runJob(job))) {
        failedJobs += 1;
      }
    }
    logger.write({ severity: "INFO", type: "JOB", message: "pass ended", tail: { jobs: jobs.length, failed: failedJobs } });
    return failedJobs;
  });
  if (!outcome.acquired) {
    logger.write({ severity: "INFO", type: "JOB", message: "pass skipped, another instance runs it" });
    return { ran: false, failedJobs: 0 };
  }
  return { ran: true, failedJobs: outcome.value };
}
