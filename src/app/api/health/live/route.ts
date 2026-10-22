/**
 * `GET /api/health/live`: the liveness probe (FND-04, `sds-api-design`).
 *
 * It checks no dependency and needs no credential. It answers while the
 * configuration is unusable: the process is alive.
 */
import { defineMethodNotAllowed, defineRoute, jsonResponse } from "@/lib/http";
import { liveness } from "@/modules/platform/services/health-service";

const SPEC = { principal: "none", probe: true, allow: ["GET"] } as const;

export const GET = defineRoute(SPEC, () => Promise.resolve(jsonResponse(liveness())));

export const POST = defineMethodNotAllowed(SPEC);
export const PUT = defineMethodNotAllowed(SPEC);
export const PATCH = defineMethodNotAllowed(SPEC);
export const DELETE = defineMethodNotAllowed(SPEC);
// Next.js answers OPTIONS itself when the file does not export it. That answer has no envelope.
export const OPTIONS = defineMethodNotAllowed(SPEC);
