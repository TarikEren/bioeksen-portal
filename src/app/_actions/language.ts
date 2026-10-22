"use server";

/**
 * The server action that sets the language of the interface (FND-08, DEC-017).
 *
 * Skeleton of stage B0: it changes nothing and answers the failure envelope
 * `SYS-5000`. When built, it validates `language`, sets the cookie `bp_lang`
 * for 365 days, and answers `{ status: "ok" }`. A server action is a public
 * POST endpoint, so it validates its argument even though the form only offers
 * two values.
 */
import { type ActionResult, NotImplemented, failureEnvelope } from "@/lib/errors";

export async function setLanguage(language: "tr" | "en"): Promise<ActionResult> {
  void language;
  return failureEnvelope(new NotImplemented("setLanguage"));
}
