"use client";

/**
 * The correction of a LOT's manufacturing date, with a reason (CAT-41, DEC-046,
 * mockup `DateCorrectionDrawer`).
 *
 * The page shows this control only to a holder of `catalog.lot.correct`. Hiding
 * a button is not authorization: the action and the service check the permission
 * again (CAT-41.AC3). The drawer shows the stored date, the date that the LOT
 * number encodes and the supplied date side by side, so the person chooses with
 * both in view; neither is preselected as the right one, and the field starts on
 * the stored date. The encoded date comes from the server: nothing here reads the
 * LOT number (CAT-30 rule 3). The reason is required by the server (CAT-41.AC2),
 * and the form shows the error it returns. The correction is audited with the
 * reason. A success is announced in a status region that is always rendered.
 * The dates are in IBM Plex Mono (FND-09.AC3). The trigger button names the LOT
 * in its accessible name, because it repeats in each row.
 */
import { Button, Description, FieldError, Form, Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import { correctManufacturingDateAction } from "@/app/_actions/catalog";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";

import { DateInput } from "../../../_components/date-input";
import { DoneNotice } from "../../../_components/done-notice";
import { FormDrawer } from "../../../_components/form-drawer";

interface CorrectDateFormProps {
  readonly lotId: string;
  /** The stored date, `YYYY-MM-DD`, for the field. */
  readonly storedDate: string;
  readonly labels: CorrectDateButtonProps["labels"];
  readonly dates: CorrectDateButtonProps["dates"];
  readonly failure: FailureLabels;
  readonly onSaved: () => void;
}

const FIELDS = ["manufacturingDate", "reason"] as const;

function CorrectDateForm({ lotId, storedDate, labels, dates, failure: failureLabels, onSaved }: CorrectDateFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await correctManufacturingDateAction(lotId, {
        manufacturingDate: readText(formData, "manufacturingDate"),
        reason: readText(formData, "reason"),
      });
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
      <p>{labels.lede}</p>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-muted">{labels.stored}</dt>
        <dd className="font-mono">{dates.stored}</dd>
        <dt className="text-muted">{labels.encoded}</dt>
        <dd className="font-mono">{dates.encoded}</dd>
        {dates.supplied === null ? null : (
          <>
            <dt className="text-muted">{labels.supplied}</dt>
            <dd className="font-mono">{dates.supplied}</dd>
          </>
        )}
      </dl>
      {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <DateInput name="manufacturingDate" label={labels.date} defaultValue={storedDate} isRequired />
      <TextField isRequired name="reason">
        <Label>{labels.reason}</Label>
        <TextArea rows={3} />
        <Description>{labels.reasonHint}</Description>
        <FieldError />
      </TextField>
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

interface CorrectDateButtonProps {
  readonly lotId: string;
  readonly storedDate: string;
  /** The three dates as finished text (DEC-133). `supplied` is `null` when no date was supplied. */
  readonly dates: { readonly stored: string; readonly encoded: string; readonly supplied: string | null };
  readonly labels: {
    readonly button: string;
    readonly buttonLabel: string;
    readonly title: string;
    /** The sentence that names the LOT and its catalog number, already filled. */
    readonly lede: string;
    readonly stored: string;
    readonly encoded: string;
    readonly supplied: string;
    readonly date: string;
    readonly reason: string;
    readonly reasonHint: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
    readonly done: string;
  };
  readonly failure: FailureLabels;
}

export function CorrectDateButton({ lotId, storedDate, dates, labels, failure }: CorrectDateButtonProps) {
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <FormDrawer trigger={labels.button} triggerLabel={labels.buttonLabel} title={labels.title}>
        {(close) => (
          <CorrectDateForm
            lotId={lotId}
            storedDate={storedDate}
            labels={labels}
            dates={dates}
            failure={failure}
            onSaved={() => {
              setDone(labels.done);
              close();
            }}
          />
        )}
      </FormDrawer>
      <DoneNotice message={done} />
    </div>
  );
}
