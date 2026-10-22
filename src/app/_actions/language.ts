"use server";

/**
 * The server action that sets the language of the interface (FND-08, DEC-017).
 *
 * A server action is a public POST endpoint, so it validates its argument even
 * though the language switch only offers two values. It validates `language`,
 * sets the cookie `bp_lang` for 365 days, and answers the envelope of
 * `sds-api-design`. The language is a preference of the visitor and not a
 * protected record, so the action needs no credential. The Next.js check of the
 * `Origin` header against the host stays on (FND-07 rule 3).
 */
import { z } from "zod";

import { type ActionResult } from "@/lib/errors";
import { bodyValidationError, runAction } from "@/lib/http";
import { LANGUAGES } from "@/lib/i18n";
import { storeLanguage } from "@/lib/i18n/server";

const argumentSchema = z.strictObject({ language: z.enum(LANGUAGES) });

export async function setLanguage(language: "tr" | "en"): Promise<ActionResult> {
  return runAction("setLanguage", async () => {
    // The type says "tr" | "en". A caller can send anything, so check it again.
    const input: unknown = language === undefined ? {} : { language };
    const parsed = argumentSchema.safeParse(input);
    if (!parsed.success) {
      throw bodyValidationError(input, parsed.error);
    }
    await storeLanguage(parsed.data.language);
    return { status: "ok" };
  });
}
