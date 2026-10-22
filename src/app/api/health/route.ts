/**
 * `GET /api/health`: the full health report (FND-04 rule 1, operator only).
 *
 * Skeleton of stage B0: answers 500 `SYS-5000`. When built, it needs an
 * operator token (`sds-auth`) and reports `object-store` and `smtp` under its
 * dependencies (FND-04 rule 2).
 */
import { NotImplemented } from "@/lib/errors";
import { failureResponse } from "@/lib/http";

export function GET(): Response {
  return failureResponse(new NotImplemented("GET /api/health"));
}
