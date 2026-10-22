/**
 * `POST /api/test/echo`: the test seam that proves the body checks of the route
 * wrapper (stage B0 plan, **Test seams**; FND-05.AC3, AC5).
 *
 * Skeleton of stage B0: answers 500 `SYS-5000`. When built, the seam works only
 * when `TEST_SEAMS_ENABLED` is `true` and `APP_ENV` is not `production`
 * (FND-03 rule 4), and answers 404 otherwise. The body is `{ "value": string }`
 * with a limit of 1 MiB, and the answer is `{ "status": "ok", "value": … }`.
 */
import { NotImplemented } from "@/lib/errors";
import { failureResponse } from "@/lib/http";

export function POST(): Response {
  return failureResponse(new NotImplemented("POST /api/test/echo"));
}
