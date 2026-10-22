/**
 * `GET /api/health`: the full health report (FND-04 rule 1, operator only).
 *
 * The report adds `object-store` and `smtp` under `checks.dependencies`
 * (FND-04 rule 2). Their failure leaves `status` at `ok` and the answer at 200:
 * the app degrades and still serves.
 */
import { defineMethodNotAllowed, defineRoute, jsonResponse } from "@/lib/http";
import { fullHealth } from "@/modules/platform/services/health-service";

const SPEC = { principal: "operator", allow: ["GET"] } as const;

export const GET = defineRoute(SPEC, async () => {
  const report = await fullHealth();
  return jsonResponse(report, report.status === "ok" ? 200 : 503);
});

export const POST = defineMethodNotAllowed(SPEC);
export const PUT = defineMethodNotAllowed(SPEC);
export const PATCH = defineMethodNotAllowed(SPEC);
export const DELETE = defineMethodNotAllowed(SPEC);
// Next.js answers OPTIONS itself when the file does not export it. That answer has no envelope.
export const OPTIONS = defineMethodNotAllowed(SPEC);
