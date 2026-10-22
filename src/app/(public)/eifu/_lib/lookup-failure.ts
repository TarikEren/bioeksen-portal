/**
 * The failure text of the lookup page (DEC-122, IFU-70 rule 5, IFU-70.AC6,
 * IFU-70.AC8).
 *
 * The server page builds the `FailureLabels` of each step here and passes them to
 * the client components as props. The sentence of a code comes from
 * `lookup.errors` of the step, because one code can mean another rule in each
 * step (`VAL-4006` is a wrong code in the code step). The sentence of a field
 * issue comes from `lookup.issues`, keyed by the name of the phrase in
 * `LOOKUP_ISSUES`. This file turns the name into the phrase, so the dictionary
 * never copies a phrase and a new phrase fails the type check here.
 */
import { type FailureLabels, failureLabels } from "@/app/_components/failure";
import type { Dictionary } from "@/lib/i18n";
import { LOOKUP_ISSUES, type LookupIssue } from "@/lib/schemas/lookup";

/** The steps that call an action: the verification step and the code step. */
export type LookupStep = keyof Dictionary["lookup"]["errors"];

/** The sentence for each phrase of `LOOKUP_ISSUES`, by phrase. A phrase that has no text fails the type check. */
function issueTexts(text: Dictionary): Readonly<Record<LookupIssue, string>> {
  const issues = text.lookup.issues;
  return {
    [LOOKUP_ISSUES.required]: issues.required,
    [LOOKUP_ISSUES.outOfRange]: issues.outOfRange,
    [LOOKUP_ISSUES.noticeNotAccepted]: issues.noticeNotAccepted,
    [LOOKUP_ISSUES.noticeVersionNotCurrent]: issues.noticeVersionNotCurrent,
    [LOOKUP_ISSUES.codeWrong]: issues.codeWrong,
    [LOOKUP_ISSUES.verificationNotFound]: issues.verificationNotFound,
  };
}

/** The labels of a failure in one step of the lookup page. */
export function lookupFailureLabels(text: Dictionary, step: LookupStep): FailureLabels {
  return failureLabels(text, text.lookup.errors[step], issueTexts(text));
}
