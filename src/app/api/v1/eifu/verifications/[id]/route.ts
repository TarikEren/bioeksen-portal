/**
 * `GET /api/v1/eifu/verifications/{id}` gives `id`, `expiresAt` and
 * `attemptsRemaining` (IFU-50 rule 5, IFU-50.AC12, DEC-097). The route needs no
 * session. An id that is not a UUID, and an unknown id, both give 404 `RES-4200`.
 */
import { defineMethodNotAllowed, defineRoute, okResponse, readPathParam } from "@/lib/http";
import { VerificationView } from "@/lib/schemas/lookup";
import { getVerification } from "@/modules/eifu/services/verification-service";

export const GET = defineRoute({ principal: "none", allow: ["GET"] }, async ({ params }) => {
  const view = await getVerification(readPathParam(params, "id", VerificationView.shape.id));
  return okResponse(view);
});

const OTHER_METHODS = { principal: "none", allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
