/**
 * `POST /api/test/clock`: moves the clock of the app (FND-03 rule 4). The body is
 * `{ now }`, an RFC 3339 instant with an offset, or `{ now: null }` for the system
 * time. The clock goes on ticking from the instant. The answer is
 * `{ status: "ok", now }` with the time of the app. It answers 404 `RES-4200`
 * unless the test seams are open.
 */
import { z } from "zod";

import { defineJsonRoute, defineMethodNotAllowed, okResponse } from "@/lib/http";
import { moveTestClock } from "@/modules/platform/services/test-seam-service";

const BodySchema = z.strictObject({ now: z.iso.datetime({ offset: true }).nullable() });

export const POST = defineJsonRoute({ principal: "none", testSeam: true, bodySchema: BodySchema }, ({ body }) => {
  const current = moveTestClock(body.now === null ? null : new Date(body.now));
  return Promise.resolve(okResponse({ now: current.toISOString() }));
});

const OTHER_METHODS = { principal: "none", testSeam: true, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
