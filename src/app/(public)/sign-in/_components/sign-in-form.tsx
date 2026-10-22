"use client";

/**
 * The sign-in form (ACC-20.AC1, ACC-50.AC1, AC2).
 *
 * It calls `signInAction`. After a success the person goes to `/backoffice` when
 * the user holds a permission, else to `/no-area` (`landingPathFor`). A wrong
 * email address, a wrong password and an inactive account get one answer
 * (`AUTH-4101`, ACC-20.AC2), so the form shows one sentence for it and never
 * tells which case it was. The rate limit answers `RATE-4400`. The form shows
 * the localized sentence for a code with the code beside it, and never the
 * `message` of the answer (DEC-122). It does not re-validate: the server does.
 */
import { Button, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";

import { signInAction } from "@/app/_actions/identity";
import { AppLink } from "@/app/_components/app-link";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { landingPathFor } from "@/app/_lib/landing";

interface SignInFormProps {
  readonly labels: {
    readonly email: string;
    readonly password: string;
    readonly submit: string;
    readonly submitting: string;
    readonly forgotPassword: string;
  };
  readonly failure: FailureLabels;
}

export function SignInForm({ labels, failure: failureLabels }: SignInFormProps) {
  const router = useRouter();
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await signInAction({
        email: readText(formData, "email"),
        password: readText(formData, "password"),
      });
      if (result.status === "ok") {
        router.push(landingPathFor(result.user.permissions));
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
        // Not `<form action>`: React 19 resets the fields before the action
        // runs, and a rejected sign-in would wipe the email address.
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      {failure !== null && !hasShownFieldError(fields, ["email", "password"]) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <TextField isRequired name="email" type="email" autoComplete="username">
        <Label>{labels.email}</Label>
        <Input />
        <FieldError />
      </TextField>
      <TextField isRequired name="password" type="password" autoComplete="current-password">
        <Label>{labels.password}</Label>
        <Input />
        <FieldError />
      </TextField>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.submitting : labels.submit}
        </Button>
        <AppLink href="/password-reset">{labels.forgotPassword}</AppLink>
      </div>
    </Form>
  );
}
