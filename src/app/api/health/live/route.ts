/**
 * `GET /api/health/live`: the liveness probe (FND-04, `sds-api-design`).
 *
 * Skeleton of stage B0: answers 500 `SYS-5000`. It checks no dependency and
 * needs no credential when built.
 */
import { NotImplemented } from "@/lib/errors";
import { failureResponse } from "@/lib/http";

export function GET(): Response {
  return failureResponse(new NotImplemented("GET /api/health/live"));
}
