/**
 * Reads the answer of a route handler that the browser called with `fetch`
 * (DEC-092, DEC-122, `sds-nextjs-frontend` §1 and §7).
 *
 * The body of a response is outside data, so it is `unknown` until a schema
 * narrows it. A success is `{ status: "ok" }`, and a failure is the envelope of
 * `sds-api-design` with a code of the registry. The `details` of a failure are
 * kept only when they name fields, as the forms use them. A body that is no
 * envelope throws, and `useActionOutcome` turns the throw into the text of a
 * failed call (DEC-122). The file is client-safe: it imports no server module.
 */
import { z } from "zod";

import { ERROR_CODES } from "@/lib/errors";
import type { ActionResult } from "@/lib/errors";

const FieldIssues = z.array(z.strictObject({ field: z.string(), issue: z.string() }));

const OkBody = z.looseObject({ status: z.literal("ok") });

const FailureBody = z.looseObject({
  status: z.literal("fail"),
  code: z.enum(ERROR_CODES),
  message: z.string(),
  details: FieldIssues.nullable().catch(null),
});

const Envelope = z.union([OkBody, FailureBody]);

/**
 * Reads a body that is an envelope. `body` is the parsed JSON of a response.
 *
 * @throws ZodError when `body` is no envelope.
 */
export function parseEnvelope(body: unknown): ActionResult {
  const envelope = Envelope.parse(body);
  if (envelope.status === "ok") {
    return { status: "ok" };
  }
  return { status: "fail", code: envelope.code, message: envelope.message, details: envelope.details };
}

/**
 * Reads the answer of a route handler as an envelope.
 *
 * @throws SyntaxError when the body is no JSON; ZodError when it is no envelope.
 */
export async function readEnvelope(response: Response): Promise<ActionResult> {
  const body: unknown = await response.json();
  return parseEnvelope(body);
}
