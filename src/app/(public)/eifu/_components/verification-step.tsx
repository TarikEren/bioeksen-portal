"use client";

/**
 * The verification step of the lookup page (IFU-70 rule 2, IFU-70.AC1, AC2, AC6,
 * AC8, IFU-50, DEC-087, DEC-097, DEC-098).
 *
 * The form takes the catalog number, the LOT number and the email address, shows
 * the full consent text with its version, and has the consent box not ticked
 * (DEC-087). It calls `createVerificationAction`. After a success the parent shows
 * the code step. A failure shows the localized sentence for its code with the code
 * (DEC-122) and never the `message`. A mail failure (`UP-5500`, `UP-5501`,
 * `UP-5000`) leaves the person on this step with the typed values, and the sentence
 * says that the code mail failed (IFU-70.AC6). The text of a field comes from its
 * phrase. The server names `noticeVersion` when the consent text is not the
 * current one: the form shows that text under the consent box, because the page
 * has no input for it. The form does not re-validate: the server does. The submit
 * button is on while the box is not ticked, so that the server refuses it
 * (IFU-50.AC4).
 */
import { Button, Checkbox, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";

import { createVerificationAction } from "@/app/_actions/lookup";
import { type FailureLabels, fieldErrorsOf } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";

import { moveFieldErrors } from "../_lib/lookup-fields";
import { ConsentNotice } from "./consent-notice";
import type { LookupCopy } from "../_lib/lookup-copy";
import { StepHeading } from "./step-heading";

/** What the person typed. The flow keeps it, so that "start again" can fill the fields. */
export interface LookupInputs {
  readonly catalogNumber: string;
  readonly lotNumber: string;
  readonly email: string;
}

interface VerificationStepProps {
  readonly copy: Pick<LookupCopy, "verify" | "notice">;
  readonly failure: FailureLabels;
  /** The value of `EIFU_LEGAL_NOTICE_VERSION`. */
  readonly noticeVersion: string;
  readonly initial: LookupInputs;
  readonly focusHeading: boolean;
  readonly onCreated: (verificationId: string, inputs: LookupInputs) => void;
}

export function VerificationStep({
  copy,
  failure: failureLabels,
  noticeVersion,
  initial,
  focusHeading,
  onCreated,
}: VerificationStepProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const inputs: LookupInputs = {
        catalogNumber: readText(formData, "catalogNumber"),
        lotNumber: readText(formData, "lotNumber"),
        email: readText(formData, "email"),
      };
      const result = await createVerificationAction({
        ...inputs,
        noticeVersion,
        noticeAccepted: readText(formData, "noticeAccepted") === "true",
      });
      if (result.status === "ok") {
        onCreated(result.id, inputs);
      }
      return result;
    },
    { focusAfterSuccess: false },
  );
  const failure = failureOf(state.outcome);
  const fields = moveFieldErrors(fieldErrorsOf(failure, failureLabels), "noticeVersion", "noticeAccepted");

  return (
    <section className="flex flex-col gap-4">
      <StepHeading focusOnMount={focusHeading}>{copy.verify.title}</StepHeading>
      <Form
        ref={formRef}
        validationBehavior="aria"
        validationErrors={fields}
        className="flex flex-col gap-4"
        aria-busy={pending}
        onSubmit={(event) => {
          // Not `<form action>`: React 19 resets the fields before the action
          // runs, and a refused submit would wipe what the person typed.
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        {failure === null ? null : <FailureAlert failure={failure} labels={failureLabels} />}
        <TextField isRequired name="catalogNumber" autoComplete="off" defaultValue={initial.catalogNumber}>
          <Label>{copy.verify.catalogNumber}</Label>
          <Input className="font-mono" spellCheck={false} />
          <Description>{copy.verify.catalogNumberHint}</Description>
          <FieldError />
        </TextField>
        <TextField isRequired name="lotNumber" autoComplete="off" defaultValue={initial.lotNumber}>
          <Label>{copy.verify.lotNumber}</Label>
          <Input className="font-mono" spellCheck={false} />
          <Description>{copy.verify.lotNumberHint}</Description>
          <FieldError />
        </TextField>
        <TextField isRequired name="email" type="email" autoComplete="email" defaultValue={initial.email}>
          <Label>{copy.verify.email}</Label>
          <Input />
          <Description>{copy.verify.emailHint}</Description>
          <FieldError />
        </TextField>
        <ConsentNotice copy={copy.notice} version={noticeVersion} />
        {/* Not ticked when the page opens, and never ticked by the system (DEC-087). */}
        <Checkbox isRequired name="noticeAccepted" value="true" defaultSelected={false}>
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            {copy.verify.consent}
          </Checkbox.Content>
          <FieldError />
        </Checkbox>
        <div>
          <Button type="submit" variant="primary" isDisabled={pending}>
            {pending ? copy.verify.submitting : copy.verify.submit}
          </Button>
        </div>
      </Form>
    </section>
  );
}
