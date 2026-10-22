"use client";

/**
 * The form that creates an override from a LOT to a version (IFU-40.AC1 to AC5,
 * mockup `OverrideDrawer`).
 *
 * It calls `createOverrideAction` with the id of the chosen version and a reason,
 * which the server requires (IFU-40.AC5). The page offers only the versions of the
 * product of the LOT that are published or superseded (DEC-066), and the server
 * checks the same rules again: a draft or a withdrawn version, or a version of
 * another product, is 400 `VAL-4006` on `documentVersionId` (IFU-40.AC2, AC3), and
 * a LOT that has an active override is 409 `RES-4300` (IFU-40.AC4); the sentence for
 * the code shows (DEC-122). The form says before the button that the override
 * replaces the resolution by date and that the reason is audited. A document
 * number and a revision label are in IBM Plex Mono (DEC-016). A success resets the
 * form with a new `key` and is announced by the status region of the page; the page
 * reads the new data after `revalidatePath` of the action. The form does not
 * re-validate: the server does.
 */
import { Button, Description, FieldError, Form, Label, ListBox, Select, TextArea, TextField } from "@heroui/react";

import { createOverrideAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";

const FIELDS = ["documentVersionId", "reason"] as const;

/** One version that an override may name, with its text already filled. */
export interface VersionChoice {
  readonly id: string;
  readonly documentNumber: string;
  readonly revision: string;
  /** The text of the state of the version. */
  readonly status: string;
  /** The text of the period of the version. */
  readonly period: string;
}

interface CreateOverrideFormProps {
  readonly lotId: string;
  readonly versions: readonly VersionChoice[];
  readonly labels: {
    readonly lede: string;
    readonly version: string;
    readonly versionPlaceholder: string;
    readonly reason: string;
    readonly reasonHint: string;
    readonly submit: string;
    readonly saving: string;
  };
  readonly failure: FailureLabels;
  readonly onCreated: () => void;
}

export function CreateOverrideForm({ lotId, versions, labels, failure: failureLabels, onCreated }: CreateOverrideFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await createOverrideAction(lotId, {
        documentVersionId: readText(formData, "documentVersionId"),
        reason: readText(formData, "reason"),
      });
      if (result.status === "ok") {
        onCreated();
      }
      return result;
    },
    { focusAfterSuccess: true },
  );
  const failure = failureOf(state.outcome);
  const fields = fieldErrorsOf(failure, failureLabels);

  return (
    <Form
      key={state.successes}
      ref={formRef}
      validationBehavior="aria"
      validationErrors={fields}
      className="flex max-w-xl flex-col gap-4"
      aria-busy={pending}
      onSubmit={(event) => {
        // Not `<form action>`: React 19 resets the fields before the action
        // runs, and a rejected submit would wipe what the person typed.
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <p>{labels.lede}</p>
      {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <Select isRequired name="documentVersionId" placeholder={labels.versionPlaceholder}>
        <Label>{labels.version}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {versions.map((version) => (
              <ListBox.Item
                key={version.id}
                id={version.id}
                textValue={`${version.documentNumber} ${version.revision} ${version.status} ${version.period}`}
              >
                <span className="font-mono">{version.documentNumber}</span>{" "}
                <span className="font-mono">{version.revision}</span> <span>{version.status}</span>{" "}
                <span className="font-mono text-muted">{version.period}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <FieldError />
      </Select>
      <TextField isRequired name="reason">
        <Label>{labels.reason}</Label>
        <TextArea rows={3} />
        <Description>{labels.reasonHint}</Description>
        <FieldError />
      </TextField>
      <div>
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
      </div>
    </Form>
  );
}
