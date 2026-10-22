/**
 * The values of the `[param]` folders of a path (`sds-nextjs-backend` §3: every
 * `[param]` folder is user input).
 *
 * This file is pure.
 */
import type { z } from "zod";

import { AppError, CODE_MEANINGS } from "@/lib/errors";

import type { RouteParams } from "./route";

/**
 * Reads one path value and checks it with a schema. A value that the schema
 * refuses names no resource, so the answer is 404 `RES-4200` (an id is opaque,
 * `app-endpoints.md`). The answer does not tell a malformed id from a missing
 * record.
 *
 * @throws AppError `RES-4200`.
 */
export function readPathParam<TValue>(params: RouteParams, name: string, schema: z.ZodType<TValue>): TValue {
  const parsed = schema.safeParse(params[name]);
  if (!parsed.success) {
    throw new AppError("RES-4200", CODE_MEANINGS["RES-4200"], { reason: "a path value is malformed" });
  }
  return parsed.data;
}
