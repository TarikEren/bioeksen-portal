"use client";

/**
 * The form that withdraws a published or superseded version (IFU-31, DEC-064,
 * mockup `DocumentDetailPage` and `ReasonDialog`), in a drawer.
 *
 * It calls `withdrawVersionAction` with a reason, which the server requires
 * (IFU-31.AC4), and with `reopenPrevious` when the person asks for it. The
 * choice to reopen shows only for a published version, which holds the open period
 * (IFU-31.AC3). A withdrawal leaves its period empty unless the person asks to
 * reopen the previous one, and the form says this before the button, because the
 * system never guesses which of the two is right (DEC-064). The reason is
 * audited. The form does not re-validate: the server does, and the sentence for
 * the failure shows with its code (DEC-122).
 */
import { Button, Checkbox, Description, FieldError, Form, Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import { withdrawVersionAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";

const FIELDS = ["reason"] as const;

interface WithdrawFormProps {
  readonly versionId: string;
  /** Whether the form offers the reopen of the previous period. */
  readonly canReopen: boolean;
  readonly labels: {
    readonly lede: string;
    readonly reason: string;
    readonly reasonHint: string;
    readonly reopen: string;
    readonly reopenHint: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
  /** Called after a success, with whether the withdrawal reopened a version. */
  readonly onWithdrawn: (reopened: boolean) => void;
}

export function WithdrawForm({ versionId, canReopen, labels, failure: failureLabels, onWithdrawn }: WithdrawFormProps) {
  const [reopen, setReopen] = useState(false);
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await withdrawVersionAction(versionId, {
        reason: readText(formData, "reason"),
        ...(canReopen && reopen ? { reopenPrevious: true } : {}),
      });
      if (result.status === "ok") {
        onWithdrawn(result.reopenedVersionId !== null);
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
      {canReopen ? (
        <div className="flex flex-col gap-1">
          <Checkbox isSelected={reopen} onChange={setReopen}>
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {labels.reopen}
            </Checkbox.Content>
          </Checkbox>
          <p className="text-sm text-muted">{labels.reopenHint}</p>
        </div>
      ) : null}
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
