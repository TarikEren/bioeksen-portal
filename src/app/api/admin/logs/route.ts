/**
 * `GET /api/admin/logs`: the logs of this app (FND-04 rule 3, operator only).
 *
 * Skeleton of stage B0: answers 500 `SYS-5000`. When built, it needs an
 * operator token and reads the local store `platform_log_record` (DEC-127)
 * through a service, with the query and the list body of `sds-api-design`.
 */
import { NotImplemented } from "@/lib/errors";
import { failureResponse } from "@/lib/http";

export function GET(): Response {
  return failureResponse(new NotImplemented("GET /api/admin/logs"));
}
