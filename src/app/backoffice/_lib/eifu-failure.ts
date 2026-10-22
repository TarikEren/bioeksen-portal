/**
 * The failure text of the e-IFU pages (DEC-122, stage B3).
 *
 * A server page builds the `FailureLabels` of a form here and passes them to the
 * client form as props. The sentence of a code comes from `eifu.errors.general`
 * and from the map of the form, because one code can mean another rule in each
 * form (`RES-4302` in a publication and in an upload). The sentence of a field
 * issue comes from `eifu.issues`, keyed by the name of the phrase in
 * `EIFU_ISSUES`. This file turns the name into the phrase, so no phrase is
 * copied into the dictionary and a new phrase fails the type check here (review
 * 5, R-071).
 */
import { type FailureLabels, failureLabels } from "@/app/_components/failure";
import type { Dictionary } from "@/lib/i18n";
import { EIFU_ISSUES, type EifuIssue } from "@/lib/schemas/eifu";

/** The forms that have their own failure sentences: the keys of `eifu.errors` but `general`. */
export type EifuForm = Exclude<keyof Dictionary["eifu"]["errors"], "general">;

/** The sentence for each phrase of `EIFU_ISSUES`, by phrase. A phrase that has no text fails the type check. */
function issueTexts(text: Dictionary): Readonly<Record<EifuIssue, string>> {
  const issues = text.eifu.issues;
  return {
    [EIFU_ISSUES.required]: issues.required,
    [EIFU_ISSUES.fileNotPdf]: issues.fileNotPdf,
    [EIFU_ISSUES.fileEmpty]: issues.fileEmpty,
    [EIFU_ISSUES.hashDiffers]: issues.hashDiffers,
    [EIFU_ISSUES.sameBytes]: issues.sameBytes,
    [EIFU_ISSUES.productNotFound]: issues.productNotFound,
    [EIFU_ISSUES.languageCodeInvalid]: issues.languageCodeInvalid,
    [EIFU_ISSUES.effectiveFromNotAfterOpenPeriod]: issues.effectiveFromNotAfterOpenPeriod,
    [EIFU_ISSUES.effectiveFromBeforeLatestEnd]: issues.effectiveFromBeforeLatestEnd,
    [EIFU_ISSUES.versionNotFound]: issues.versionNotFound,
    [EIFU_ISSUES.versionNotPublished]: issues.versionNotPublished,
    [EIFU_ISSUES.versionOfOtherProduct]: issues.versionOfOtherProduct,
  };
}

/** The labels of a failure on an e-IFU page. A page with no form of its own passes no `form`. */
export function eifuFailureLabels(text: Dictionary, form?: EifuForm): FailureLabels {
  const formErrors = form === undefined ? {} : text.eifu.errors[form];
  return failureLabels(text, { ...text.eifu.errors.general, ...formErrors }, issueTexts(text));
}
