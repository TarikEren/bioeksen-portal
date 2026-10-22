/**
 * How the pages show a failed call (DEC-122, FND-08 rule 1,
 * `sds-nextjs-frontend` §6).
 *
 * A failure shows the localized text for its code, with the code beside it. It
 * never shows the `message` of the answer. A field of `details` shows the
 * localized text for its fixed phrase, next to the field. A call that gets no
 * envelope shows the localized text of a failed call, with no code. This file is
 * pure: a server component builds `FailureLabels` from the dictionary, and a
 * client component takes them as props, so only the text a control shows
 * reaches the browser.
 */
import type { ErrorCode, ErrorDetails, FieldIssue } from "@/lib/errors";
import type { Dictionary } from "@/lib/i18n";
import { textForCode } from "@/lib/i18n/messages";

/** The text that a failure needs. */
export interface FailureLabels {
  /** The sentence for each code, by code. */
  readonly errors: Readonly<Record<string, string>>;
  /** The template of the code part. It names the placeholder `{code}`. */
  readonly errorCode: string;
  /** The sentence for a call that got no envelope. It has no code. */
  readonly callFailed: string;
  /** The sentence for a code with no entry in `errors`. */
  readonly fallback: string;
  /** The sentence for each fixed phrase of `details`, by phrase. */
  readonly fieldIssues: Readonly<Record<string, string>>;
  /** The sentence for a phrase with no entry in `fieldIssues`. */
  readonly fieldInvalid: string;
}

/**
 * Builds the labels of a failure from the dictionary.
 *
 * @param overrides Sentences that a page needs for a code, merged over `common.errors`.
 * @param issueTexts Sentences for more phrases of `details`, merged over `common.fieldIssues`.
 */
export function failureLabels(
  text: Dictionary,
  overrides: Readonly<Record<string, string>> = {},
  issueTexts: Readonly<Record<string, string>> = {},
): FailureLabels {
  return {
    errors: { ...text.common.errors, ...overrides },
    errorCode: text.common.errorCode,
    callFailed: text.common.callFailed,
    fallback: text.common.errors["SYS-5000"],
    fieldIssues: { ...text.common.fieldIssues, ...issueTexts },
    fieldInvalid: text.common.fieldInvalid,
  };
}

/** What the person sees after a failed call: an envelope with a code, or a call with no envelope. */
export type FailureView =
  | { readonly status: "fail"; readonly code: ErrorCode; readonly details: ErrorDetails }
  | { readonly status: "no-answer" };

function isFieldIssues(details: ErrorDetails): details is readonly FieldIssue[] {
  return Array.isArray(details);
}

/**
 * The texts of the field errors of a failure, by field name, for the
 * `validationErrors` of HeroUI's `Form`. A failure with no field entries gives
 * an empty object.
 */
export function fieldErrorsOf(failure: FailureView | null, labels: FailureLabels): Record<string, string[]> {
  if (failure === null || failure.status !== "fail" || !isFieldIssues(failure.details)) {
    return {};
  }
  const byField = new Map<string, string[]>();
  for (const { field, issue } of failure.details) {
    const texts = byField.get(field) ?? [];
    texts.push(textForCode(labels.fieldIssues, issue, labels.fieldInvalid));
    byField.set(field, texts);
  }
  return Object.fromEntries(byField);
}

/** Whether a failure holds an error for at least one of the fields that the form shows. */
export function hasShownFieldError(
  fields: Readonly<Record<string, readonly string[]>>,
  shown: readonly string[],
): boolean {
  return shown.some((name) => Object.hasOwn(fields, name));
}
