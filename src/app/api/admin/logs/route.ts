/**
 * `GET /api/admin/logs`: the logs of this app (FND-04 rule 3, operator only).
 *
 * It reads the local store `platform_log_record` (DEC-127) through a service,
 * with the query and the list body of `sds-api-design`.
 */
import { requireOperator } from "@/lib/auth";
import { defineMethodNotAllowed, defineRoute, okResponse } from "@/lib/http";
import { listLogs } from "@/modules/platform/services/log-service";

const SPEC = { principal: "operator", allow: ["GET"] } as const;

export const GET = defineRoute(SPEC, async ({ request, principal }) => {
  const page = await listLogs(requireOperator(principal), request.nextUrl.searchParams);
  return okResponse(page);
});

export const POST = defineMethodNotAllowed(SPEC);
export const PUT = defineMethodNotAllowed(SPEC);
export const PATCH = defineMethodNotAllowed(SPEC);
export const DELETE = defineMethodNotAllowed(SPEC);
// Next.js answers OPTIONS itself when the file does not export it. That answer has no envelope.
export const OPTIONS = defineMethodNotAllowed(SPEC);
