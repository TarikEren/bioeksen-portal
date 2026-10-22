/**
 * `POST /api/v1/eifu/document-versions/{id}/withdrawal` withdraws a `PUBLISHED`
 * or `SUPERSEDED` version with a reason, and reopens the previous version when
 * `reopenPrevious` is true (`eifu.document.withdraw`, IFU-31, DEC-064). 404
 * `RES-4200`; 400 `VAL-4001` without a reason (AC4); 409 `RES-4302` (AC3).
 */
import { requireActor } from "@/lib/auth/session";
import { defineJsonRoute, defineMethodNotAllowed, okResponse, readPathParam } from "@/lib/http";
import { WithdrawInput } from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";
import { withdrawVersion } from "@/modules/eifu/services/publication-service";
import { resolveSessionActor } from "@/modules/identity/current-actor";

export const POST = defineJsonRoute(
  {
    principal: "session",
    resolveSession: resolveSessionActor,
    permission: "eifu.document.withdraw",
    allow: ["POST"],
    bodySchema: WithdrawInput,
  },
  async ({ actor, params, body }) => {
    const result = await withdrawVersion(requireActor(actor), readPathParam(params, "id", EntityId), body);
    return okResponse({ ...result });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
