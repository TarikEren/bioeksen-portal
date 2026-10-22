"use server";

/**
 * The server actions of the public lookup page `/eifu` (stage B4 contract,
 * IFU-50, IFU-51, IFU-60, IFU-70).
 *
 * The page calls these actions instead of `fetch`, as the sign-in page does
 * (`signInAction`). A server action is a public POST endpoint, and these three
 * need no session (DEC-070). Each one validates its argument first (400
 * `VAL-40xx`, an unknown field is `VAL-4007`), and then calls the same service as
 * the route handler of the same operation. Next.js compares `Origin` with the
 * host (FND-07 rule 3). Each action answers the envelope of `sds-api-design`.
 *
 * The limits of DEC-072 apply to the actions as to the routes: the service counts
 * them by the email address and by the source address. An action gives 429
 * `RATE-4400` as a failure envelope. It has no `Retry-After` header.
 */
import { cookies, headers } from "next/headers";
import { z } from "zod";

import { lookupMetaOf } from "@/app/_lib/lookup-meta";
import type { ActionResult } from "@/lib/errors";
import { parseWith, runAction } from "@/lib/http";
import {
  type LookupAnswer,
  LookupInput,
  type VerificationCreated,
  VerificationInput,
  type VerificationView,
} from "@/lib/schemas/lookup";
import { lookup } from "@/modules/eifu/services/lookup-service";
import { createVerification, getVerification } from "@/modules/eifu/services/verification-service";

const VerificationIdArgument = z.strictObject({ id: z.uuid() });

/** Starts a verification and sends the code mail (IFU-50). The answer is `{ status: "ok", id, expiresAt }`. */
export async function createVerificationAction(input: VerificationInput): Promise<ActionResult<VerificationCreated>> {
  return runAction("createVerification", async () => {
    const body = parseWith(VerificationInput, input);
    const created = await createVerification(body, lookupMetaOf(await headers(), await cookies()));
    return { status: "ok", ...created };
  });
}

/**
 * Reads a verification: `{ status: "ok", id, expiresAt, attemptsRemaining }`. The
 * page calls it after a wrong code to show the tries that remain (IFU-70.AC7,
 * DEC-097). An id that is not a UUID is 400 `VAL-4006`.
 */
export async function getVerificationAction(input: { readonly id: string }): Promise<ActionResult<VerificationView>> {
  return runAction("getVerification", async () => {
    const view = await getVerification(parseWith(VerificationIdArgument, input).id);
    return { status: "ok", ...view };
  });
}

/**
 * Checks the code and gives the files (IFU-51, IFU-60). A correct code answers
 * `{ status: "ok", outcome, … }`, also when the lookup finds no document (DEC-073).
 * Narrow the answer with `outcome === "RESOLVED"`.
 */
export async function lookupAction(input: LookupInput): Promise<ActionResult<LookupAnswer>> {
  return runAction<LookupAnswer>("lookup", async () => {
    const body = parseWith(LookupInput, input);
    const answer = await lookup(body, lookupMetaOf(await headers(), await cookies()));
    return { status: "ok", ...answer };
  });
}
