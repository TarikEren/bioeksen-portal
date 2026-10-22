/**
 * The wrapper of a route handler and the body checks (FND-05, FND-04).
 *
 * Skeleton of stage B0: the names and the signatures. Every body throws
 * `NotImplemented`.
 *
 * The wrapper, when built, does these steps in the order of `sds-auth` and
 * `sds-logging` (`code-prefixes.md`, selection procedure): it adopts or makes
 * the request id, checks the credential of the route, checks the method, the
 * media type and the size of the body (413 `VAL-4550`, 415 `VAL-4600`), parses
 * the body with a strict schema (400 `VAL-4000`, `VAL-4001`, `VAL-4007`), calls
 * the handler, and maps an error to the failure envelope with the same code in
 * the log record.
 */
import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";

import { NotImplemented } from "@/lib/errors";
import type { OperatorPrincipal } from "@/lib/auth";

/** The body limit is 1 MiB, except where an item records another (FND-05 rule 7). */
export const DEFAULT_BODY_LIMIT_BYTES = 1_048_576;

export interface RouteSpec<TBody> {
  /** The credential that the route needs. A probe needs none. */
  readonly principal: "none" | "operator";
  /** The strict schema of the JSON body. A route without a body leaves it out. */
  readonly bodySchema?: z.ZodType<TBody>;
  /** The body limit in bytes. Default: `DEFAULT_BODY_LIMIT_BYTES`. */
  readonly bodyLimitBytes?: number;
}

export interface RouteInput<TBody> {
  readonly request: NextRequest;
  /** The parsed body, `undefined` when the route has no body. */
  readonly body: TBody;
  /** The caller, `null` when the route needs no credential. */
  readonly principal: OperatorPrincipal | null;
}

export type RouteHandler = (request: NextRequest) => Promise<Response>;

/** Wraps the handler of a route. The result is the export `GET`, `POST`, … of `route.ts`. */
export function defineRoute<TBody = undefined>(
  spec: RouteSpec<TBody>,
  handler: (input: RouteInput<TBody>) => Promise<Response>,
): RouteHandler {
  void spec;
  void handler;
  throw new NotImplemented("defineRoute");
}

/**
 * Reads the JSON body of a request in the limit, and parses it with the schema.
 *
 * @throws AppError `VAL-4550` when the body is larger than the limit.
 * @throws AppError `VAL-4600` when the media type is not `application/json`.
 * @throws AppError `VAL-4000` when the body is not JSON.
 * @throws AppError `VAL-4001` or `VAL-4007` when the schema refuses the body.
 */
export async function readJsonBody<TBody>(
  request: Request,
  schema: z.ZodType<TBody>,
  limitBytes: number = DEFAULT_BODY_LIMIT_BYTES,
): Promise<TBody> {
  void request;
  void schema;
  void limitBytes;
  throw new NotImplemented("readJsonBody");
}
