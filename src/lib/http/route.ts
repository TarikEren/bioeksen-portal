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
 * 4. checks the credential of the route (`sds-auth`): an operator token (after
 *    the failure limit of the source: 429 `RATE-4400`, FND-04.AC5), or the
 *    session cookie `bp_session` and the permission that the route names
 *    (ACC-30 rule 2): 401 `AUTH-4100` without a session, 401 `AUTH-4101` for a
 *    request that changes state and has a foreign `Origin` (FND-07.AC3), 403
 *    `PERM-4150` without the permission. Each granted request is logged as
 *    `SECURITY`;
 * 5. for a route with a body: the size (413 `VAL-4550`), the media type (415
 *    `VAL-4600`), the parse (400 `VAL-4000`) and the strict schema (400
 *    `VAL-4001`, `VAL-4002`, `VAL-4006`, `VAL-4007`). A route with a file takes
 *    `multipart/form-data` in the same order (`defineMultipartRoute`, DEC-054);
 * 6. calls the handler;
 * 7. maps an error to the failure envelope, logs it with the same code, and
 *    sets `X-Request-Id`, `Cache-Control: no-store` and the headers of FND-07 on
 *    the answer.
 *
 * The rate limit of a sign-in is in the service, because it needs the email
 * address of the body (ACC-20 rule 3).
 */
import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";

import type { OperatorPrincipal } from "@/lib/auth";
import { authenticateOperatorRequest } from "@/lib/auth/operator-request";
import {
  SESSION_COOKIE,
  type SessionActor,
  type SessionResolver,
  authenticateSession,
  parseSessionId,
  requirePermission,
} from "@/lib/auth/session";
import { getConfig, getConfigState, isTestSeamEnabled } from "@/lib/config";
import { AppError, RateLimitedError } from "@/lib/errors";
import { logger } from "@/lib/logging";
import type { PermissionCode } from "@/lib/schemas/identity";
import { REQUEST_ID_HEADER, resolveRequestId, runWithRequestContext } from "@/lib/request-context";
import { applySecurityHeaders, isAllowedOrigin } from "@/lib/security";

import {
  assertDeclaredLength,
  assertJsonMediaType,
  assertMultipartMediaType,
  formDataToObject,
  parseJsonBytes,
  parseMultipartBytes,
  readBoundedBody,
} from "./body";
import { failureResponse } from "./respond";
import { bodyValidationError } from "./validation";

/** The body limit is 1 MiB, except where an item records another (FND-05 rule 7). */
export const DEFAULT_BODY_LIMIT_BYTES = 1_048_576;

interface RouteSpecBase {
  /** A test seam: the route answers 404 unless the seams are on (FND-03 rule 4). */
  readonly testSeam?: boolean;
  /** `true` for a probe. It answers while the configuration is unusable. */
  readonly probe?: boolean;
  /** The methods that the path serves. `Allow` of a 405 names them. */
  readonly allow?: readonly string[];
}

/** A route that needs no credential, or an operator token. */
export interface TokenRouteSpec extends RouteSpecBase {
  /** The credential that the route needs. A probe needs none. */
  readonly principal: "none" | "operator";
}

/**
 * A route that needs a session (ACC-30 rule 2). The route gives the resolver,
 * because `src/lib/` never imports a module (FND-01.AC4).
 */
export interface SessionRouteSpec extends RouteSpecBase {
  readonly principal: "session";
  /** Finds the actor of the session id in the cookie. */
  readonly resolveSession: SessionResolver;
  /** The permission that the route needs. A route without it needs a session only. */
  readonly permission?: PermissionCode;
}

export type RouteSpec = TokenRouteSpec | SessionRouteSpec;

export type JsonRouteSpec<TBody> = RouteSpec & {
  /** The strict schema of the JSON body. */
  readonly bodySchema: z.ZodType<TBody>;
  /** The body limit in bytes. Default: `DEFAULT_BODY_LIMIT_BYTES`. */
  readonly bodyLimitBytes?: number;
  /** The media types that the route takes. Default: `application/json`. A `PATCH` route adds `application/merge-patch+json`. */
  readonly mediaTypes?: readonly string[];
};

/** A route whose body is `multipart/form-data` (DEC-054). The schema reads the fields; a file is a `File`. */
export type MultipartRouteSpec<TBody> = RouteSpec & {
  /** The strict schema of the fields. An empty field is absent (`formDataToObject`). */
  readonly bodySchema: z.ZodType<TBody>;
  /** The body limit in bytes, counted as the body arrives. It is not optional: a file route sets its own limit. */
  readonly bodyLimitBytes: number;
};

/** The values of the `[param]` folders of the path. Each one is untrusted input. */
export type RouteParams = Readonly<Record<string, string | string[] | undefined>>;

/** What the credential step and the path give to the loader of the input. */
interface Credential {
  readonly principal: OperatorPrincipal | null;
  readonly actor: SessionActor | null;
  readonly params: RouteParams;
}

export interface RouteInput<TBody> {
  readonly request: NextRequest;
  /** The parsed body. */
  readonly body: TBody;
  /** The operator, `null` when the route needs no operator token. */
  readonly principal: OperatorPrincipal | null;
  /** The signed-in person, `null` when the route needs no session. */
  readonly actor: SessionActor | null;
  /** The values of the `[param]` folders. The handler validates each one. */
  readonly params: RouteParams;
}

/** What Next.js passes as the second argument of a route handler. */
export interface RouteHandlerContext {
  readonly params: Promise<RouteParams>;
}

export type RouteHandler = (request: NextRequest, context?: RouteHandlerContext) => Promise<Response>;

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
  if (appError instanceof RateLimitedError) {
    headers.set("Retry-After", String(appError.retryAfterSeconds));
  }
  return failureResponse(appError, headers);
}

/** The methods that only read. A request with another method changes state (FND-07 rule 3). */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A request that changes state and carries a session must come from the origin
 * of `PUBLIC_BASE_URL` (FND-07.AC3). A route handler gets no such check from
 * Next.js, so the wrapper makes it. The answer is 401 `AUTH-4101` and nothing
 * changes.
 *
 * @throws AppError `AUTH-4101`.
 */
function assertSameOrigin(request: NextRequest): void {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }
  if (!isAllowedOrigin(request.headers.get("origin"), getConfig().PUBLIC_BASE_URL)) {
    throw new AppError("AUTH-4101", "Credential invalid", { reason: "the Origin is not the origin of PUBLIC_BASE_URL" });
  }
}

/** Runs the steps of the wrapper. `load` reads the input of the route after the credential check. */
function wrap<TInput>(
  spec: RouteSpec,
  load: (request: NextRequest, credential: Credential) => Promise<TInput>,
  handler: (input: TInput) => Promise<Response>,
): RouteHandler {
  return async (request: NextRequest, context?: RouteHandlerContext): Promise<Response> => {
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
        const principal = spec.principal === "operator" ? await authenticateOperatorRequest(request.headers) : null;
        if (principal !== null) {
          // Each authorization decision is logged, the grant too (`sds-logging`, **What to log**).
          logger.write({
            severity: "INFO",
            type: "SECURITY",
            message: "operator request granted",
            tail: { sub: principal.subject, method: request.method, path: request.nextUrl.pathname },
          });
        }
        let actor: SessionActor | null = null;
        if (spec.principal === "session") {
          actor = await authenticateSession(parseSessionId(request.cookies.get(SESSION_COOKIE)?.value), spec.resolveSession);
          // The origin comes before the permission: a request from another site is not the request of the person.
          assertSameOrigin(request);
          if (spec.permission !== undefined) {
            requirePermission(actor, spec.permission);
          }
          // Each authorization decision is logged, the grant too. The session id is never logged.
          logger.write({
            severity: "INFO",
            type: "SECURITY",
            message: "session request granted",
            tail: { sub: actor.userId, method: request.method, path: request.nextUrl.pathname },
          });
        }
        const params = context === undefined ? {} : await context.params;
        response = await handler(await load(request, { principal, actor, params }));
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
    (request, credential) => Promise.resolve<RouteInput<undefined>>({ request, body: undefined, ...credential }),
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
    async (request, credential) => {
      // Size before media type (step 11 before step 12). A body with no length
      // is counted as it arrives, so it is read before the media type is checked.
      assertDeclaredLength(request, limit);
      const bytes = await readBoundedBody(request, limit);
      assertJsonMediaType(request.headers.get("content-type"), spec.mediaTypes);
      const parsed = parseJsonBytes(bytes);
      const result = spec.bodySchema.safeParse(parsed);
      if (!result.success) {
        throw bodyValidationError(parsed, result.error);
      }
      return { request, body: result.data, ...credential };
    },
    handler,
  );
}

/**
 * Wraps the handler of a route that takes a `multipart/form-data` body (DEC-054,
 * CAT-60). The order is the one of the JSON route: the size (413 `VAL-4550`,
 * counted as the body arrives), then the media type (415 `VAL-4600`), then the
 * parse (400 `VAL-4000`), then the strict schema of the fields.
 */
export function defineMultipartRoute<TBody>(
  spec: MultipartRouteSpec<TBody>,
  handler: (input: RouteInput<TBody>) => Promise<Response>,
): RouteHandler {
  return wrap(
    spec,
    async (request, credential) => {
      assertDeclaredLength(request, spec.bodyLimitBytes);
      const bytes = await readBoundedBody(request, spec.bodyLimitBytes);
      const contentType = request.headers.get("content-type");
      assertMultipartMediaType(contentType);
      const form = await parseMultipartBytes(bytes, contentType ?? "");
      const fields = formDataToObject(form);
      const result = spec.bodySchema.safeParse(fields);
      if (!result.success) {
        throw bodyValidationError(fields, result.error);
      }
      return { request, body: result.data, ...credential };
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
export function defineMethodNotAllowed(spec: RouteSpec & { readonly allow: readonly string[] }): RouteHandler {
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
