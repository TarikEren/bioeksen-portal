"use client";

/**
 * The form that sets a password from an emailed link: the invitation
 * (`/invitation`, ACC-10.AC3) and the password reset (`/password-reset/complete`,
 * ACC-11.AC2). Two routes use it, so it is here and not in one route.
 *
 * The token is in the URL fragment `#token=` (DEC-138). The browser does not send
 * the fragment, so no server log and no proxy log holds it. The form reads
 * `window.location.hash` when the person submits, and sends the token in the
 * body of the action. After a success it removes the fragment from the address
 * bar. The server checks the token and the password rules. The form never
 * re-validates: it shows each broken rule from `details` as a list next to the
 * password field (ACC-10.AC5), and the localized sentence for the code of any
 * other failure, with the code (DEC-122). The action comes in as a prop, so the
 * same form serves both flows.
 */
import { Alert, Button, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";

import type { ActionResult } from "@/lib/errors";
import type { SetPasswordInput } from "@/lib/schemas/identity";

import { AppLink } from "./app-link";
import { FailureAlert } from "./failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "./failure";
import { failureOf, readText, useFormAction } from "./use-action-outcome";

interface SetPasswordFormProps {
  /** The server action of the flow. */
  readonly action: (input: SetPasswordInput) => Promise<ActionResult>;
  readonly labels: {
    readonly password: string;
    readonly hint: string;
    readonly submit: string;
    readonly saving: string;
    readonly doneTitle: string;
    readonly doneBody: string;
    readonly signIn: string;
  };
  readonly failure: FailureLabels;
}

/** The token of the fragment `#token=<value>`, or the empty text. The server rejects an empty token. */
function readTokenFromFragment(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export function SetPasswordForm({ action, labels, failure: failureLabels }: SetPasswordFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await action({ token: readTokenFromFragment(), password: readText(formData, "password") });
      if (result.status === "ok") {
        // The link is used up. Keep the token out of the address bar and the history.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      return result;
    },
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
      {isDone ? (
        <div>
          <AppLink href="/sign-in">{labels.signIn}</AppLink>
        </div>
      ) : (
        <Form
          ref={formRef}
          validationBehavior="aria"
          validationErrors={fields}
          className="flex flex-col gap-4"
          aria-busy={pending}
          onSubmit={(event) => {
            // Not `<form action>`: React 19 resets the fields before the action
            // runs, and a rejected password would be lost.
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          {failure !== null && !hasShownFieldError(fields, ["password"]) ? (
            <FailureAlert failure={failure} labels={failureLabels} />
          ) : null}
          <TextField isRequired name="password" type="password" autoComplete="new-password">
            <Label>{labels.password}</Label>
            <Input />
            <Description>{labels.hint}</Description>
            <FieldError>
              {({ validationErrors }) => (
                <ul className="list-disc ps-5">
                  {validationErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </FieldError>
          </TextField>
          <div>
            <Button type="submit" variant="primary" isDisabled={pending}>
              {pending ? labels.saving : labels.submit}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}
