/**
 * The text that the client components of the lookup page show (IFU-70).
 *
 * The server page reads the dictionary and gives the client only this part of
 * it: the failure text goes in `FailureLabels`, built by `lookup-failure.ts`, so
 * `errors` and `issues` stay out, and so do the title and the introduction, which the server page shows. The type derives from the dictionary, so a
 * change of the dictionary breaks the build and not the page.
 */
import type { Dictionary } from "@/lib/i18n";

export type LookupCopy = Omit<Dictionary["lookup"], "errors" | "issues" | "title" | "intro">;

/** The text of the client flow. It names each group, so a new group is a choice and not an accident. */
export function lookupCopyOf(text: Dictionary): LookupCopy {
  const lookup = text.lookup;
  return {
    verify: lookup.verify,
    notice: lookup.notice,
    code: lookup.code,
    result: lookup.result,
    languages: lookup.languages,
    outcomeCode: lookup.outcomeCode,
    outcomes: lookup.outcomes,
  };
}
