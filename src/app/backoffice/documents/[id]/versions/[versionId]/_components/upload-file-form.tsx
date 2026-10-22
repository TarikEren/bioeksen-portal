"use client";

/**
 * The form that uploads a PDF file to a draft version (IFU-20 rules 1 to 4,
 * DEC-092, mockup `FileUpload`).
 *
 * The browser sends the file with `fetch`, as `multipart/form-data`, to
 * `POST /api/v1/eifu/document-versions/{id}/files`. A server action does not take
 * a document file: the body of an action is capped at 1 MiB, and a document file
 * is up to 20 MiB (`sds-nextjs-frontend` §7 Forms rule 7). The route answers the
 * envelope of `sds-api-design`, which `readEnvelope` reads as outside data. The
 * form sends the language code and the file, and nothing else: the server reads the
 * type from the bytes, calculates the hash and keeps the name only as information
 * (IFU-20 rules 2, 3 and 5). The form does not re-validate: a file over the limit,
 * a file that is no PDF, a second file for the same language and a language that is
 * no BCP 47 tag are refused by the server, and the sentence for the code shows
 * (DEC-122). The language code is a business identifier, so its text is in IBM Plex
 * Mono (DEC-016). A success resets the form with a new `key`, announces the result
 * in the status region that is always rendered, and asks the router for the new
 * data, because a route handler does not revalidate the page.
 */
import { Button, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { readEnvelope } from "@/app/_lib/read-envelope";
import { DoneNotice } from "@/app/backoffice/_components/done-notice";

const FIELDS = ["languageCode", "file"] as const;

interface UploadFileFormProps {
  readonly versionId: string;
  readonly labels: {
    readonly language: string;
    readonly languageHint: string;
    readonly file: string;
    readonly fileHint: string;
    readonly submit: string;
    readonly uploading: string;
    readonly done: string;
  };
  readonly failure: FailureLabels;
}

export function UploadFileForm({ versionId, labels, failure: failureLabels }: UploadFileFormProps) {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const body = new FormData();
      body.set("languageCode", readText(formData, "languageCode"));
      const file = formData.get("file");
      // An empty file input is left out, so the server reads an absent field.
      if (file instanceof File && file.size > 0) {
        body.set("file", file);
      }
      const response = await fetch(`/api/v1/eifu/document-versions/${encodeURIComponent(versionId)}/files`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const result = await readEnvelope(response);
      setDone(result.status === "ok" ? labels.done : null);
      if (result.status === "ok") {
        router.refresh();
      }
      return result;
    },
    { focusAfterSuccess: true },
  );
  const failure = failureOf(state.outcome);
  const fields = fieldErrorsOf(failure, failureLabels);

  return (
    <div className="flex flex-col gap-3">
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
        {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
          <FailureAlert failure={failure} labels={failureLabels} />
        ) : null}
        <TextField isRequired name="languageCode" defaultValue="tr" autoComplete="off">
          <Label>{labels.language}</Label>
          <Input className="font-mono" />
          <Description>{labels.languageHint}</Description>
          <FieldError />
        </TextField>
        <TextField isRequired name="file" type="file">
          <Label>{labels.file}</Label>
          <Input accept="application/pdf" />
          <Description>{labels.fileHint}</Description>
          <FieldError />
        </TextField>
        <div>
          <Button type="submit" variant="primary" isDisabled={pending}>
            {pending ? labels.uploading : labels.submit}
          </Button>
        </div>
      </Form>
      <DoneNotice message={done} />
    </div>
  );
}
