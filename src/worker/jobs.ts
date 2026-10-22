/**
 * The jobs of the worker (PLT-30 rule 2). Release 1 has three: the identity
 * re-encryption (IFU-90), the retention pass (IFU-81), and the removal of the
 * verifications that ended more than 24 hours before (IFU-50). Stage B4 adds the
 * removal and the re-encryption. The retention pass comes with B5.
 *
 * Each job logs its start, its end and its failure as `JOB` records
 * (`job-service.ts`), and a failed job does not stop the other one
 * (PLT-30.AC2).
 */
import "server-only";

import { moveIdentitiesToNewestKey, removeEndedVerifications } from "@/modules/eifu/services/identity-maintenance-service";
import type { Job } from "@/modules/platform/services/job-service";

export const JOBS: readonly Job[] = [
  {
    name: "eifu verification removal",
    run: async () => {
      await removeEndedVerifications();
    },
  },
  {
    name: "eifu identity key move",
    run: async () => {
      await moveIdentitiesToNewestKey();
    },
  },
];
