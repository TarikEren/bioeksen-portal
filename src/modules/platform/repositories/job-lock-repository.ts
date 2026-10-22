/**
 * The lock of the hourly pass (DEC-008, PLT-30.AC1): a PostgreSQL advisory lock
 * lets only one worker instance run the jobs at a time.
 */
import "server-only";

import { type AdvisoryLockResult, tryWithAdvisoryLock } from "@/lib/db";

/** The key of the lock of the pass. Any other advisory lock of the app takes another key. */
const PASS_LOCK_KEY = BigInt(7_301_540_001);

/** Runs `work` while this instance holds the lock of the pass. It does not wait for the lock. */
export function withPassLock<TValue>(work: () => Promise<TValue>): Promise<AdvisoryLockResult<TValue>> {
  return tryWithAdvisoryLock(PASS_LOCK_KEY, work);
}
