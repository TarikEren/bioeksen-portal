/**
 * `GET /api/health/ready`: the readiness probe (FND-04 rule 2, FND-03 rule 3).
 *
 * Skeleton of stage B0: answers 500 `SYS-5000`. When built, it checks
 * PostgreSQL and Redis, needs no credential, and answers 503 with the health
 * body while the configuration is unusable.
 */
import { NotImplemented } from "@/lib/errors";
import { failureResponse } from "@/lib/http";

export function GET(): Response {
  return failureResponse(new NotImplemented("GET /api/health/ready"));
}
