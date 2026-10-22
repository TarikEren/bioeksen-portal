"use client";

/**
 * The form that changes the proposed start of a draft version (IFU-10.AC5,
 * AC6), in a drawer.
 *
 * It sends a JSON Merge Patch to `updateVersionAction` (RFC 7396): a date sets the
 * proposal and an empty field sends `null`, which removes it. The proposal is a
 * note for the person who publishes, and no lookup reads it (DEC-062). A version
 * that is not a draft (`RES-4302`) shows the sentence for the code. The date is a
 * business identifier, so its text is in IBM Plex Mono (DEC-016). The form does not
 * re-validate: the server does.
 */
import { Button, Form } from "@heroui/react";

import { updateVersionAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { DateInput } from "@/app/backoffice/_components/date-input";

const FIELDS = ["proposedEffectiveFrom"] as const;

interface ProposedStartFormProps {
  readonly versionId: string;
  /** The proposed start, `YYYY-MM-DD`, or the empty text when there is none. */
  readonly current: string;
  readonly labels: {
    readonly label: string;
    readonly hint: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
  readonly onSaved: () => void;
}

export function ProposedStartForm({ versionId, current, labels, failure: failureLabels, onSaved }: ProposedStartFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const value = readText(formData, "proposedEffectiveFrom");
      const result = await updateVersionAction(versionId, { proposedEffectiveFrom: value === "" ? null : value });
      if (result.status === "ok") {
        onSaved();
      }
      return result;
    },
    { focusAfterSuccess: false },
  );
  const failure = failureOf(state.outcome);
  const fields = fieldErrorsOf(failure, failureLabels);

  return (
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
      {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <DateInput name="proposedEffectiveFrom" label={labels.label} hint={labels.hint} defaultValue={current} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Button slot="close" variant="tertiary" isDisabled={pending}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
