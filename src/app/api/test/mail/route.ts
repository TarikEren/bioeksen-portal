/**
 * `GET /api/test/mail?to=<address>`: the messages that the fake mail transport
 * kept for an address, newest first (FND-03 rule 4). The answer is
 * `{ status: "ok", messages: [{ to, subject, text, sentAt }] }`. The text holds
 * the link with the token. It answers 404 `RES-4200` unless the test seams are open.
 */
import { z } from "zod";

import { defineMethodNotAllowed, defineRoute, okResponse, parseWith } from "@/lib/http";
import { readTestMail } from "@/modules/platform/services/test-seam-service";

const QuerySchema = z.object({ to: z.email().max(254) });

export const GET = defineRoute({ principal: "none", testSeam: true, allow: ["GET"] }, async ({ request }) => {
  const query = parseWith(QuerySchema, { to: request.nextUrl.searchParams.get("to") ?? undefined });
  return okResponse({ messages: await readTestMail(query.to) });
});

const OTHER_METHODS = { principal: "none", testSeam: true, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
