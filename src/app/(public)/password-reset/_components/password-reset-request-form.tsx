"use client";

/**
 * The form that asks for a password reset (ACC-11.AC1).
 *
 * The answer is the same whether or not the email address belongs to an active
 * user, so after a success the form shows one message and never says if a mail
 * went out. The form calls `requestPasswordResetAction`. A failure shows the
 * localized sentence for its code with the code beside it (DEC-122). The result
 * is announced with `role="status"` on a container that is always rendered.
 */
import { Alert, Button, FieldError, Form, Input, Label, TextField } from "@heroui/react";

import { requestPasswordResetAction } from "@/app/_actions/identity";
import { AppLink } from "@/app/_components/app-link";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";

interface PasswordResetRequestFormProps {
  readonly labels: {
    readonly email: string;
    readonly submit: string;
    readonly saving: string;
    readonly doneTitle: string;
    readonly doneBody: string;
    readonly backToSignIn: string;
  };
  readonly failure: FailureLabels;
}

export function PasswordResetRequestForm({ labels, failure: failureLabels }: PasswordResetRequestFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    (formData) => requestPasswordResetAction({ email: readText(formData, "email") }),
    { focusAfterSuccess: false },
  );
  const failure = failureOf(state.outcome);
  const fields = fieldErrorsOf(failure, failureLabels);
  const isDone = state.outcome.status === "ok";

  return (
    <div className="flex flex-col gap-4">
      {/* A success waits its turn. The status region is always rendered. */}
      <div role="status">
        {isDone ? (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{labels.doneTitle}</Alert.Title>
              <Alert.Description>{labels.doneBody}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </div>
      {isDone ? null : (
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
          {failure !== null && !hasShownFieldError(fields, ["email"]) ? (
            <FailureAlert failure={failure} labels={failureLabels} />
          ) : null}
          <TextField isRequired name="email" type="email" autoComplete="email">
            <Label>{labels.email}</Label>
            <Input />
            <FieldError />
          </TextField>
          <div>
            <Button type="submit" variant="primary" isDisabled={pending}>
              {pending ? labels.saving : labels.submit}
            </Button>
          </div>
        </Form>
      )}
      <div>
        <AppLink href="/sign-in">{labels.backToSignIn}</AppLink>
      </div>
    </div>
  );
}
