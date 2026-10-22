/**
 * The wrapper of a route handler (FND-05, FND-04, FND-07).
 *
 * For each request it does these steps, in the order of `sds-auth` and
 * `sds-logging` (`code-prefixes.md`, selection procedure):
 *
 * 1. adopts the request id of the caller, or makes one, and opens the request
 *    context, so every log record of the request carries `request=`;
 * 2. for a test seam, answers 404 when the seams are off (FND-03 rule 4);
 * 3. answers 503 `SYS-5500` when the configuration is unusable, except for a
 *    probe, which reports the state itself;
 * 4. checks the credential of the route (`sds-auth`);
 * 5. for a route with a body: the size (413 `VAL-4550`), the media type (415
 *    `VAL-4600`), the parse (400 `VAL-4000`) and the strict schema (400
 *    `VAL-4001`, `VAL-4002`, `VAL-4006`, `VAL-4007`);
 * 6. calls the handler;
 * 7. maps an error to the failure envelope, logs it with the same code, and
 *    sets `X-Request-Id`, `Cache-Control: no-store` and the headers of FND-07 on
 *    the answer.
 *
 * Rate limiting (step 1 of the order of `sds-auth`) comes in stage B1.
 */
import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";

import { type OperatorPrincipal, authenticateOperator } from "@/lib/auth";
import { getConfigState, isTestSeamEnabled } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging";
import { REQUEST_ID_HEADER, resolveRequestId, runWithRequestContext } from "@/lib/request-context";
import { applySecurityHeaders } from "@/lib/security";

import { assertDeclaredLength, assertJsonMediaType, parseJsonBytes, readBoundedBody } from "./body";
import { failureResponse } from "./respond";
import { bodyValidationError } from "./validation";

/** The body limit is 1 MiB, except where an item records another (FND-05 rule 7). */
export const DEFAULT_BODY_LIMIT_BYTES = 1_048_576;

export interface RouteSpec {
  /** The credential that the route needs. A probe needs none. */
  readonly principal: "none" | "operator";
  /** A test seam: the route answers 404 unless the seams are on (FND-03 rule 4). */
  readonly testSeam?: boolean;
  /** `true` for a probe. It answers while the configuration is unusable. */
  readonly probe?: boolean;
  /** The methods that the path serves. `Allow` of a 405 names them. */
  readonly allow?: readonly string[];
}

export interface JsonRouteSpec<TBody> extends RouteSpec {
  /** The strict schema of the JSON body. */
  readonly bodySchema: z.ZodType<TBody>;
  /** The body limit in bytes. Default: `DEFAULT_BODY_LIMIT_BYTES`. */
  readonly bodyLimitBytes?: number;
}

export interface RouteInput<TBody> {
  readonly request: NextRequest;
  /** The parsed body. */
  readonly body: TBody;
  /** The caller, `null` when the route needs no credential. */
  readonly principal: OperatorPrincipal | null;
}

export type RouteHandler = (request: NextRequest) => Promise<Response>;

/** Gives the answer the headers that every answer carries. */
function finalize(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set("Cache-Control", "no-store");
  applySecurityHeaders(headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function answerFailure(error: unknown, request: NextRequest, spec: RouteSpec): Response {
  const unhandled = !(error instanceof AppError);
  const appError = unhandled ? new AppError("SYS-5000", "Unhandled error", { cause: error }) : error;

  logger.failure(appError.code, {
    tail: {
      method: request.method,
      path: request.nextUrl.pathname,
      status: appError.status,
      ...(appError.reason === null ? {} : { reason: appError.reason }),
    },
    error: unhandled ? error : appError.cause,
  });

  const headers = new Headers();
  if (appError.code === "RES-4500" && spec.allow !== undefined) {
    headers.set("Allow", spec.allow.join(", "));
  }
  return failureResponse(appError, headers);
}

/** Runs the steps of the wrapper. `load` reads the input of the route after the credential check. */
function wrap<TInput>(
  spec: RouteSpec,
  load: (request: NextRequest, principal: OperatorPrincipal | null) => Promise<TInput>,
  handler: (input: TInput) => Promise<Response>,
): RouteHandler {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    return runWithRequestContext({ requestId }, async () => {
      let response: Response;
      try {
        if (spec.testSeam === true && !isTestSeamEnabled()) {
          throw new AppError("RES-4200", "Resource does not exist");
        }
        if (spec.probe !== true && getConfigState().status === "failed") {
          throw new AppError("SYS-5500", "Not ready", { reason: "the configuration is unusable" });
        }
        const principal =
          spec.principal === "operator" ? await authenticateOperator(request.headers.get("authorization")) : null;
        response = await handler(await load(request, principal));
      } catch (error) {
        response = answerFailure(error, request, spec);
      }
      return finalize(response, requestId);
    });
  };
}

/** Wraps the handler of a route that takes no body. The result is the export `GET`, … of `route.ts`. */
export function defineRoute(spec: RouteSpec, handler: (input: RouteInput<undefined>) => Promise<Response>): RouteHandler {
  return wrap(
    spec,
    (request, principal) => Promise.resolve<RouteInput<undefined>>({ request, body: undefined, principal }),
    handler,
  );
}

/** Wraps the handler of a route that takes a JSON body. */
export function defineJsonRoute<TBody>(
  spec: JsonRouteSpec<TBody>,
  handler: (input: RouteInput<TBody>) => Promise<Response>,
): RouteHandler {
  const limit = spec.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES;
  return wrap(
    spec,
    async (request, principal) => {
      // Size before media type (step 11 before step 12), then the parse.
      assertDeclaredLength(request, limit);
      assertJsonMediaType(request.headers.get("content-type"));
      const parsed = parseJsonBytes(await readBoundedBody(request, limit));
      const result = spec.bodySchema.safeParse(parsed);
      if (!result.success) {
        throw bodyValidationError(parsed, result.error);
      }
      return { request, body: result.data, principal };
    },
    handler,
  );
}

/**
 * The export for a method that a path does not serve: 405 `RES-4500` with
 * `Allow`. The credential of the route comes first, so a caller without one
 * learns nothing about the methods of the path (`code-prefixes.md`, step 10
 * after steps 2 to 9).
 */
export function defineMethodNotAllowed(spec: {
  readonly principal: "none" | "operator";
  readonly allow: readonly string[];
  readonly probe?: boolean;
  readonly testSeam?: boolean;
}): RouteHandler {
  return defineRoute(spec, () => Promise.reject(new AppError("RES-4500", "Method not allowed")));
}

/**
 * The export for a path that does not exist under `/api`: 404 `RES-4200` for
 * every method. Without it, Next.js answers an unknown API path with its HTML
 * page, which has no envelope and no request id.
 */
export function defineNotFound(): RouteHandler {
  return defineRoute({ principal: "none", probe: true }, () =>
    Promise.reject(new AppError("RES-4200", "Resource does not exist")),
  );
}
