/**
 * `POST /api/v1/eifu/lookups` checks the verification code, uses the verification
 * and gives the files of the correct version (IFU-51, IFU-60, DEC-073). The route
 * needs no session. A correct code answers 200 with an `outcome`, also when the
 * lookup finds no document. 400 `VAL-4006` (the code, the verification id),
 * `VAL-4007`; 409 `RES-4302`; 429 `RATE-4400` with `Retry-After`; 500 `DB-5001`
 * when the access record cannot be written.
 */
import { lookupMetaOf } from "@/app/_lib/lookup-meta";
import { defineJsonRoute, defineMethodNotAllowed, okResponse } from "@/lib/http";
import { LookupInput } from "@/lib/schemas/lookup";
import { lookup } from "@/modules/eifu/services/lookup-service";

export const POST = defineJsonRoute({ principal: "none", allow: ["POST"], bodySchema: LookupInput }, async ({ request, body }) => {
  const answer = await lookup(body, lookupMetaOf(request.headers, request.cookies));
  return okResponse(answer);
});

const OTHER_METHODS = { principal: "none", allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
