/**
 * The jobs of the worker (PLT-30 rule 2). Release 1 has three: the identity
 * re-encryption (IFU-90), the retention pass (IFU-81), and the removal of the
 * verifications that ended more than 24 hours before (IFU-50). Stage B4 adds
 * them. Stage B1 has none, so a pass only takes the lock and logs.
 */
import "server-only";

import type { Job } from "@/modules/platform/services/job-service";

export const JOBS: readonly Job[] = [];
