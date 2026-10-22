/**
 * `GET /api/health/ready`: the readiness probe (FND-04 rule 2, FND-03 rule 3).
 *
 * It checks PostgreSQL and Redis, and needs no credential. It answers 503 with
 * the health body (`status` `fail`, no `code`) while a gating dependency does
 * not answer and while the configuration is unusable.
 */
import { defineMethodNotAllowed, defineRoute, jsonResponse } from "@/lib/http";
import { readiness } from "@/modules/platform/services/health-service";

const SPEC = { principal: "none", probe: true, allow: ["GET"] } as const;

export const GET = defineRoute(SPEC, async () => {
  const report = await readiness();
  return jsonResponse(report, report.status === "ok" ? 200 : 503);
});

export const POST = defineMethodNotAllowed(SPEC);
export const PUT = defineMethodNotAllowed(SPEC);
export const PATCH = defineMethodNotAllowed(SPEC);
export const DELETE = defineMethodNotAllowed(SPEC);
// Next.js answers OPTIONS itself when the file does not export it. That answer has no envelope.
export const OPTIONS = defineMethodNotAllowed(SPEC);
