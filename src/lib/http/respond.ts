/**
 * The answers of a route handler (FND-05 rule 2, `sds-api-design`).
 *
 * The headers that every answer carries (`X-Request-Id`, `Cache-Control`, and
 * the headers of FND-07) come from the route wrapper (`./route.ts`).
 */
import { type AppError, failureEnvelope } from "@/lib/errors";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/** A JSON answer with the status given. */
export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", JSON_CONTENT_TYPE);
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

/** The success envelope: `status` `ok` and the payload beside it (`app-endpoints.md`). */
export function okResponse(payload: object = {}, status = 200): Response {
  return jsonResponse({ status: "ok", ...payload }, status);
}

/** The failure envelope, with the HTTP status of the code. */
export function failureResponse(error: AppError, headers?: HeadersInit): Response {
  return jsonResponse(failureEnvelope(error), error.status, headers);
}
