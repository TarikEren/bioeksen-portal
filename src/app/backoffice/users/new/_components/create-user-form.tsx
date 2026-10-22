"use client";

/**
 * The form that creates a user (ACC-10.AC1, AC2).
 *
 * It calls `createUserAction`. The service creates the user with no password and
 * sends one invitation. After a success the person goes to the page of the new
 * user. A duplicate email address (`RES-4300`) shows the localized sentence with
 * the code, and each field error shows next to its field (DEC-122). The form does
 * not re-validate: the server does. The preferred language starts with the active
 * language of the page, and the person can change it. Cancel is navigation, not a
 * submit.
 */
import { Button, FieldError, Form, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";

import { createUserAction } from "@/app/_actions/identity";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { LANGUAGES, type Language, isLanguage } from "@/lib/i18n/languages";

interface CreateUserFormProps {
  /** The language that the select starts with. */
  readonly defaultLanguage: Language;
  readonly labels: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly preferredLanguage: string;
    readonly languagePlaceholder: string;
    readonly tr: string;
    readonly en: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
}

const FIELDS = ["email", "firstName", "lastName", "preferredLanguage"] as const;

export function CreateUserForm({ defaultLanguage, labels, failure: failureLabels }: CreateUserFormProps) {
  const router = useRouter();
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const chosen = readText(formData, "preferredLanguage");
      const result = await createUserAction({
        email: readText(formData, "email"),
        firstName: readText(formData, "firstName"),
        lastName: readText(formData, "lastName"),
        // The select always holds a language. The fallback is the start value of the select.
        preferredLanguage: isLanguage(chosen) ? chosen : defaultLanguage,
      });
      if (result.status === "ok") {
        router.push(`/backoffice/users/${result.user.id}`);
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
      className="flex max-w-md flex-col gap-4"
      aria-busy={pending}
      onSubmit={(event) => {
        // Not `<form action>`: React 19 resets the fields before the action
        // runs, and a rejected submit would wipe what the person typed.
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <TextField isRequired name="email" type="email" autoComplete="off">
        <Label>{labels.email}</Label>
        <Input />
        <FieldError />
      </TextField>
      <TextField isRequired name="firstName" autoComplete="off">
        <Label>{labels.firstName}</Label>
        <Input />
        <FieldError />
      </TextField>
      <TextField isRequired name="lastName" autoComplete="off">
        <Label>{labels.lastName}</Label>
        <Input />
        <FieldError />
      </TextField>
      <Select isRequired name="preferredLanguage" defaultValue={defaultLanguage} placeholder={labels.languagePlaceholder}>
        <Label>{labels.preferredLanguage}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {LANGUAGES.map((language) => (
              <ListBox.Item key={language} id={language} textValue={labels[language]}>
                <span lang={language}>{labels[language]}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <FieldError />
      </Select>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Button variant="tertiary" isDisabled={pending} onPress={() => router.push("/backoffice/users")}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
