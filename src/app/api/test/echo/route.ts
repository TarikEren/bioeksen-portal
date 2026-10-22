/**
 * `POST /api/test/echo`: the test seam that proves the body checks of the route
 * wrapper (stage B0 plan, **Test seams**; FND-05.AC3, AC5).
 *
 * The seam works only when `TEST_SEAMS_ENABLED` is `true` and `APP_ENV` is not
 * `production` (FND-03 rule 4). Otherwise it answers 404. The body is
 * `{ "value": string }` with a limit of 1 MiB, and the answer is
 * `{ "status": "ok", "value": … }`.
 */
import { z } from "zod";

import { defineJsonRoute, okResponse } from "@/lib/http";

const bodySchema = z.strictObject({ value: z.string() });

export const POST = defineJsonRoute({ principal: "none", testSeam: true, bodySchema }, ({ body }) =>
  Promise.resolve(okResponse({ value: body.value })),
);
