"use client";

/**
 * The form that creates a draft version of a document (IFU-10.AC3, mockup
 * `NewRevisionForm`), in a drawer.
 *
 * It calls `createVersionAction`. After a success the person goes to the page of
 * the new version, where the files are uploaded next. A revision label that the
 * document has (`RES-4300`) shows the localized sentence with the code, and each
 * field error shows next to its field (DEC-122). The proposed start is a note for
 * the person who publishes: no lookup reads it (DEC-062). The revision label and
 * the date are business identifiers, so their text is in IBM Plex Mono (DEC-016).
 * The form does not re-validate: the server does.
 */
import { Button, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";

import { createVersionAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { DateInput } from "@/app/backoffice/_components/date-input";
import type { CreateVersionInput } from "@/lib/schemas/eifu";

const FIELDS = ["revision", "proposedEffectiveFrom"] as const;

interface NewVersionFormProps {
  readonly documentId: string;
  readonly labels: {
    readonly revision: string;
    readonly revisionHint: string;
    readonly proposedStart: string;
    readonly proposedStartHint: string;
    readonly lede: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
}

export function NewVersionForm({ documentId, labels, failure: failureLabels }: NewVersionFormProps) {
  const router = useRouter();
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const proposedEffectiveFrom = readText(formData, "proposedEffectiveFrom");
      const input: CreateVersionInput = {
        revision: readText(formData, "revision"),
        ...(proposedEffectiveFrom === "" ? {} : { proposedEffectiveFrom }),
      };
      const result = await createVersionAction(documentId, input);
      if (result.status === "ok") {
        router.push(`/backoffice/documents/${documentId}/versions/${result.version.id}`);
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
      <TextField isRequired name="revision" autoComplete="off">
        <Label>{labels.revision}</Label>
        <Input className="font-mono" />
        <Description>{labels.revisionHint}</Description>
        <FieldError />
      </TextField>
      <DateInput name="proposedEffectiveFrom" label={labels.proposedStart} hint={labels.proposedStartHint} />
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
