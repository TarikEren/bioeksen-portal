/**
 * The answer of a failure from a route handler (FND-05 rule 2).
 *
 * Skeleton of stage B0: the status and the envelope only. The headers that
 * every answer carries (`X-Request-Id`, FND-05 rule 4, and `Cache-Control` of
 * the standard endpoints, FND-04) come with the route wrapper.
 */
import { type AppError, failureEnvelope } from "@/lib/errors";

export function failureResponse(error: AppError): Response {
  return Response.json(failureEnvelope(error), { status: error.status });
}
