/**
 * The worker process (PLT-30, DEC-008).
 *
 * Stage B1 step 4 builds the hourly pass with an advisory lock, so that only one
 * worker instance runs the jobs (PLT-30.AC1). Release 1 has no job in stage B1.
 * This file is a stub of step 2.
 */
import { NotImplemented } from "@/lib/errors";

// MOCK: PLT-30
export function main(): Promise<void> {
  return Promise.reject(new NotImplemented("worker.main"));
}
