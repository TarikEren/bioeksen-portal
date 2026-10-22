"use client";

/**
 * The form that publishes a draft version (IFU-30 rules 2 and 3, mockup
 * `PublishForm`), in a drawer.
 *
 * It calls `publishVersionAction` with `effectiveFrom` and `expectedProductId`:
 * the product that the page shows to the person. The product is shown and not
 * chosen, because the product of a document is fixed when the document is
 * created; if it changed since the page loaded, the service refuses the
 * publication with `RES-4301` and the sentence for the code shows (DEC-122). The
 * date is a manufacturing date, not a publication date, and the form says so
 * before the button. A date on or before the open period (IFU-30.AC3, AC8) shows
 * next to the field. A version with no active file is refused with `RES-4302`; the
 * form warns before the button and leaves the refusal to the server. The form
 * does not re-validate: the server does. The date, the stem and the dates of the
 * result are in IBM Plex Mono (DEC-016).
 */
import { Alert, Button, Form } from "@heroui/react";

import { publishVersionAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import { DateInput } from "@/app/backoffice/_components/date-input";

const FIELDS = ["effectiveFrom"] as const;

interface PublishFormProps {
  readonly versionId: string;
  /** The id of the product that the person sees. The service compares it with the product of the document. */
  readonly expectedProductId: string;
  /** The product as finished text: the stem, the status and the name. */
  readonly product: { readonly code: string; readonly status: string; readonly name: string };
  /** The proposed start, `YYYY-MM-DD`, or the empty text when there is none. */
  readonly proposedStart: string;
  readonly hasActiveFile: boolean;
  readonly labels: {
    readonly lede: string;
    readonly product: string;
    readonly effectiveFrom: string;
    readonly effectiveFromHint: string;
    readonly noFiles: string;
    readonly submit: string;
    readonly publishing: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
  /** Called after a success, with whether the publication superseded a version. */
  readonly onPublished: (supersededAnother: boolean) => void;
}

export function PublishForm({
  versionId,
  expectedProductId,
  product,
  proposedStart,
  hasActiveFile,
  labels,
  failure: failureLabels,
  onPublished,
}: PublishFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const result = await publishVersionAction(versionId, {
        effectiveFrom: readText(formData, "effectiveFrom"),
        expectedProductId,
      });
      if (result.status === "ok") {
        onPublished(result.supersededVersionId !== null);
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
      {hasActiveFile ? null : (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{labels.noFiles}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-muted">{labels.product}</dt>
        <dd className="min-w-0 break-words">
          <span className="font-mono">{product.code}</span> {product.status}{" "}
          <span className="text-muted">{product.name}</span>
        </dd>
      </dl>
      <DateInput
        name="effectiveFrom"
        label={labels.effectiveFrom}
        hint={labels.effectiveFromHint}
        defaultValue={proposedStart}
        isRequired
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.publishing : labels.submit}
        </Button>
        <Button slot="close" variant="tertiary" isDisabled={pending}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
