"use client";

/**
 * The form that replaces the active file of a published or superseded version
 * (IFU-32, DEC-065, DEC-092, mockup `FileUpload` in the mode `replace`), in a
 * drawer.
 *
 * The browser sends the reason and the file with `fetch`, as `multipart/form-data`,
 * to `POST /api/v1/eifu/document-files/{id}/replacement`, for the same reason as the
 * upload (`upload-file-form.tsx`). The form sends no language code: the
 * replacement keeps the language of the old file, and the server refuses a
 * `languageCode` with 400 `VAL-4007` (IFU-32.AC4). The reason is required by the
 * server (IFU-32.AC3) and is audited with the change. The same bytes as the file in
 * force (IFU-32.AC2) show next to the field. The form does not re-validate: the
 * server does, and the sentence for the code shows (DEC-122). A success closes the
 * drawer and asks the router for the new data, because a route handler does not
 * revalidate the page.
 */
import { Button, Description, FieldError, Form, Input, Label, TextArea, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";

import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { readEnvelope } from "@/app/_lib/read-envelope";

const FIELDS = ["reason", "file"] as const;

interface ReplaceFileFormProps {
  readonly fileId: string;
  readonly labels: {
    /** The sentence that names the language, already filled. */
    readonly lede: string;
    readonly reason: string;
    readonly reasonHint: string;
    readonly file: string;
    readonly fileHint: string;
    readonly submit: string;
    readonly uploading: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
  /** Called after a success, with the drawer still open. */
  readonly onReplaced: () => void;
}

export function ReplaceFileForm({ fileId, labels, failure: failureLabels, onReplaced }: ReplaceFileFormProps) {
  const router = useRouter();
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const body = new FormData();
      body.set("reason", readText(formData, "reason"));
      const file = formData.get("file");
      if (file instanceof File && file.size > 0) {
        body.set("file", file);
      }
      const response = await fetch(`/api/v1/eifu/document-files/${encodeURIComponent(fileId)}/replacement`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const result = await readEnvelope(response);
      if (result.status === "ok") {
        router.refresh();
        onReplaced();
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
      <TextField isRequired name="file" type="file">
        <Label>{labels.file}</Label>
        <Input accept="application/pdf" />
        <Description>{labels.fileHint}</Description>
        <FieldError />
      </TextField>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.uploading : labels.submit}
        </Button>
        <Button slot="close" variant="tertiary" isDisabled={pending}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
