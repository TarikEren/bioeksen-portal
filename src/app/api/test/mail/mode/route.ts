/**
 * `POST /api/test/mail/mode`: sets what the fake mail transport does (FND-03
 * rule 4). The body is `{ mode }`: `ok` keeps the message, `refuse` fails as a
 * relay that refuses it (`UP-5000`), `down` as a relay that is not there
 * (`UP-5500`), `timeout` as a relay that answers late (`UP-5501`). It answers 404
 * `RES-4200` unless the test seams are open.
 */
import { z } from "zod";

import { defineJsonRoute, defineMethodNotAllowed, okResponse } from "@/lib/http";
import { MailMode } from "@/lib/schemas/platform";
import { setTestMailMode } from "@/modules/platform/services/test-seam-service";

const BodySchema = z.strictObject({ mode: MailMode });

export const POST = defineJsonRoute({ principal: "none", testSeam: true, bodySchema: BodySchema }, async ({ body }) => {
  await setTestMailMode(body.mode);
  return okResponse({ mode: body.mode });
});

const OTHER_METHODS = { principal: "none", testSeam: true, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
