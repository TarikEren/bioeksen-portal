/**
 * `POST /api/v1/eifu/verifications` starts a verification and sends the code mail
 * (IFU-50, DEC-070, DEC-097). The route needs no session (DEC-070). The answer is
 * 201 with `Location` and `{ id, expiresAt }`, and it is the same whether or not
 * the catalog number or the LOT exists (IFU-50.AC3). 400 `VAL-4001`, `VAL-4006`
 * and `VAL-4007`; 429 `RATE-4400` with `Retry-After`; `UP-5500`, `UP-5501` and
 * `UP-5000` when the code mail fails.
 */
import { lookupMetaOf } from "@/app/_lib/lookup-meta";
import { defineJsonRoute, defineMethodNotAllowed, jsonResponse } from "@/lib/http";
import { VerificationInput } from "@/lib/schemas/lookup";
import { createVerification } from "@/modules/eifu/services/verification-service";

export const POST = defineJsonRoute({ principal: "none", allow: ["POST"], bodySchema: VerificationInput }, async ({ request, body }) => {
  const created = await createVerification(body, lookupMetaOf(request.headers, request.cookies));
  return jsonResponse({ status: "ok", ...created }, 201, { Location: `/api/v1/eifu/verifications/${created.id}` });
});

const OTHER_METHODS = { principal: "none", allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
