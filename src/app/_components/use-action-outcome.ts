/**
 * The state of a call to a server action, for the client components of the
 * pages (`sds-nextjs-frontend` §7 Forms).
 *
 * `useActionOutcome` holds the result in `useActionState` and runs the call in
 * a transition, so `pending` turns true while it runs. A call that gets no
 * envelope (the promise rejects) becomes the outcome `no-answer`, so that the
 * error does not reach the error screen of Next.js (DEC-122, R-002). The reason
 * of the rejection is not kept: it is not copy, and it can leak detail.
 * `useFormAction` adds the focus rule of the forms: focus goes where the person
 * acts next, once for each result.
 */
import { startTransition, useActionState, useEffect, useRef } from "react";

import type { ActionResult } from "@/lib/errors";

import type { FailureView } from "./failure";

/** The result of the last call. `idle` is the state before the first call. */
export type ActionOutcome = ActionResult | { readonly status: "idle" } | { readonly status: "no-answer" };

interface ActionState {
  readonly outcome: ActionOutcome;
  /** The number of successful calls. A form changes its `key` with it, to reset its fields. */
  readonly successes: number;
}

const INITIAL_STATE: ActionState = { outcome: { status: "idle" }, successes: 0 };

/** The failure of an outcome, or `null` when the last call did not fail. */
export function failureOf(outcome: ActionOutcome): FailureView | null {
  switch (outcome.status) {
    case "fail":
      return { status: "fail", code: outcome.code, details: outcome.details };
    case "no-answer":
      return { status: "no-answer" };
    case "ok":
    case "idle":
      return null;
  }
}

export function useActionOutcome<TInput>(run: (input: TInput) => Promise<ActionResult>) {
  const [state, dispatch, pending] = useActionState(
    async (previous: ActionState, input: TInput): Promise<ActionState> => {
      try {
        const outcome = await run(input);
        return { outcome, successes: previous.successes + (outcome.status === "ok" ? 1 : 0) };
      } catch {
        return { outcome: { status: "no-answer" }, successes: previous.successes };
      }
    },
    INITIAL_STATE,
  );

  function submit(input: TInput): void {
    startTransition(() => dispatch(input));
  }

  return { state, submit, pending };
}

interface FormActionOptions {
  /**
   * Whether focus goes to the first field after a success. A success that
   * resets the form needs it, because the remount drops focus. A success that
   * navigates does not: Next.js announces the new page.
   */
  readonly focusAfterSuccess: boolean;
}

/** `useActionOutcome` for a form, with the focus rule of `sds-nextjs-frontend` §7 Forms rule 11. */
export function useFormAction(run: (formData: FormData) => Promise<ActionResult>, options: FormActionOptions) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, submit, pending } = useActionOutcome(run);
  const { focusAfterSuccess } = options;

  useEffect(() => {
    const form = formRef.current;
    if (form === null || state.outcome.status === "idle") {
      return;
    }
    if (state.outcome.status === "ok") {
      if (focusAfterSuccess) {
        form.querySelector<HTMLElement>("input, textarea, button[aria-haspopup]")?.focus();
      }
      return;
    }
    // The server rejects fields: the first invalid field. Its error is its
    // description, so the label and the error are read together.
    const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid !== null) {
      invalid.focus();
      return;
    }
    // The server rejects the whole submit: the submit button again, because
    // disabling it while pending can drop focus, with the alert in view.
    form.querySelector<HTMLElement>('button[type="submit"]')?.focus();
    form.querySelector('[role="alert"]')?.scrollIntoView({ block: "nearest" });
  }, [state, focusAfterSuccess]);

  return { formRef, state, submit, pending };
}

/** The text of a form field, or the empty text when the field is missing. The server validates it. */
export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
