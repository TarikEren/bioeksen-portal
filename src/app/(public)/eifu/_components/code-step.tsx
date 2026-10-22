"use client";

/**
 * The code step of the lookup page (IFU-70.AC1, AC7, AC8, IFU-51, DEC-097).
 *
 * The form takes the six-digit code and calls `lookupAction`. A correct code gives
 * the answer to the parent, which shows the result. After a wrong code (`VAL-4006`
 * with the field `code`), the step reads `attemptsRemaining` with
 * `getVerificationAction` and shows it (IFU-70.AC7, DEC-097). When the read fails,
 * the step shows no number: the sentence of the failure already tells the person
 * what happened. A verification that nobody can use any more (`RES-4302`, an
 * unknown id, no tries left) shows its sentence and the button "start again", and
 * the submit button goes off. The tries region exists before it has text, so that
 * a screen reader announces the change (`role="status"`). A failure shows the
 * localized sentence for its code with the code and never the `message`
 * (DEC-122). The field `verificationId` shows under the code field, because the
 * page has no input for it. The form does not re-validate: the server does.
 */
import { Button, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { getVerificationAction, lookupAction } from "@/app/_actions/lookup";
import { type FailureLabels, fieldIssuesOf, fieldErrorsOf } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { fmt } from "@/lib/i18n/messages";
import type { LookupAnswer } from "@/lib/schemas/lookup";

import { moveFieldErrors } from "../_lib/lookup-fields";
import type { LookupCopy } from "../_lib/lookup-copy";
import { StepHeading } from "./step-heading";

interface CodeStepProps {
  readonly copy: Pick<LookupCopy, "code">;
  readonly failure: FailureLabels;
  readonly verificationId: string;
  /** The address that got the code mail. The page shows it, so a mistyped address is easy to see. */
  readonly email: string;
  readonly onResolved: (answer: LookupAnswer) => void;
  readonly onRestart: () => void;
}

export function CodeStep({ copy, failure: failureLabels, verificationId, email, onResolved, onRestart }: CodeStepProps) {
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await lookupAction({ verificationId, code: readText(formData, "code") });
      if (result.status === "ok") {
        onResolved(result);
        return result;
      }
      if (result.code === "VAL-4006" && fieldIssuesOf(result).some((issue) => issue.field === "code")) {
        try {
          const view = await getVerificationAction({ id: verificationId });
          setAttemptsRemaining(view.status === "ok" ? view.attemptsRemaining : null);
        } catch {
          // The read failed: the page shows no number. The wrong code is already shown.
          setAttemptsRemaining(null);
        }
      }
      return result;
    },
    { focusAfterSuccess: false },
  );
  const failure = failureOf(state.outcome);
  const fields = moveFieldErrors(fieldErrorsOf(failure, failureLabels), "verificationId", "code");
  const verificationGone =
    failure !== null &&
    failure.status === "fail" &&
    (failure.code === "RES-4302" || fieldIssuesOf(failure).some((issue) => issue.field === "verificationId"));
  const exhausted = attemptsRemaining === 0;
  const unusable = verificationGone || exhausted;
  let attemptsText: string | null = null;
  if (attemptsRemaining !== null) {
    attemptsText = exhausted ? copy.code.exhausted : fmt(copy.code.attempts, { count: attemptsRemaining });
  }

  return (
    <section className="flex flex-col gap-4">
      <StepHeading focusOnMount>{copy.code.title}</StepHeading>
      <p className="text-sm text-muted break-words">{fmt(copy.code.sent, { email })}</p>
      <Form
        ref={formRef}
        validationBehavior="aria"
        validationErrors={fields}
        className="flex flex-col gap-4"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        {failure === null ? null : <FailureAlert failure={failure} labels={failureLabels} />}
        <TextField isRequired name="code" autoComplete="one-time-code" inputMode="numeric">
          <Label>{copy.code.label}</Label>
          <Input className="font-mono" spellCheck={false} />
          <Description>{copy.code.hint}</Description>
          <FieldError />
        </TextField>
        <p role="status" className="text-sm">
          {attemptsText}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" isDisabled={pending || unusable}>
            {pending ? copy.code.submitting : copy.code.submit}
          </Button>
          <Button variant={unusable ? "primary" : "tertiary"} isDisabled={pending} onPress={onRestart}>
            {copy.code.restart}
          </Button>
        </div>
      </Form>
    </section>
  );
}
