"use client";

/**
 * The form that ends an override with a reason (IFU-40.AC6, AC7, mockup
 * `LotOverridePage`), in a drawer.
 *
 * It calls `endOverrideAction` with the id of the override and a reason, which the
 * server requires (IFU-40.AC7). The row stays with `isActive` false, and the LOT
 * resolves by its manufacturing date again; the form says so before the button,
 * because ending an override changes the document that a laboratory gets just as
 * much as creating one did. The reason is audited. An override that has ended
 * already is 409 `RES-4302`, and the sentence for the code shows (DEC-122). The
 * form does not re-validate: the server does.
 */
import { Button, Description, FieldError, Form, Label, TextArea, TextField } from "@heroui/react";

import { endOverrideAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";

const FIELDS = ["reason"] as const;

interface EndOverrideFormProps {
  readonly overrideId: string;
  readonly labels: {
    readonly lede: string;
    readonly reason: string;
    readonly reasonHint: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
  /** Called after a success, with the drawer still open. */
  readonly onEnded: () => void;
}

export function EndOverrideForm({ overrideId, labels, failure: failureLabels, onEnded }: EndOverrideFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await endOverrideAction(overrideId, { reason: readText(formData, "reason") });
      if (result.status === "ok") {
        onEnded();
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
      <p>{labels.lede}</p>
      {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <TextField isRequired name="reason">
        <Label>{labels.reason}</Label>
        <TextArea rows={3} />
        <Description>{labels.reasonHint}</Description>
        <FieldError />
      </TextField>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="danger" isDisabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Button slot="close" variant="tertiary" isDisabled={pending}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
