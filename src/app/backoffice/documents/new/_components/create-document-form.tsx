"use client";

/**
 * The form that creates a document (IFU-10.AC1, AC2, mockup `NewDocumentForm`).
 *
 * It calls `createDocumentAction`. After a success the person goes to the page of
 * the new document. A duplicate document number (`RES-4300`) shows the localized
 * sentence with the code, and each field error, such as the blank title entry of
 * DEC-011, shows next to its field (DEC-122). The form does not re-validate: the
 * server does. The product is sent as it is chosen, and the server refuses an id
 * that names no product. The document number is a business identifier, so its text
 * is in IBM Plex Mono (DEC-016). Cancel is navigation, not a submit.
 */
import { Button, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";

import { createDocumentAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import type { CreateDocumentInput } from "@/lib/schemas/eifu";

import { type ProductOption, ProductSelect } from "../../_components/product-select";

/** The names of the fields that the form shows, as the server names them in `details`. */
const FIELDS = ["documentNumber", "title.tr", "title.en", "productId"] as const;

interface CreateDocumentFormProps {
  readonly products: readonly ProductOption[];
  /** The product that the page chooses at first, for example the one of the product page. */
  readonly initialProductId: string | null;
  readonly labels: {
    readonly number: string;
    readonly numberHint: string;
    readonly titleTr: string;
    readonly titleEn: string;
    readonly product: string;
    readonly productPlaceholder: string;
    readonly productHint: string;
    readonly submit: string;
    readonly cancel: string;
    readonly saving: string;
  };
  readonly failure: FailureLabels;
}

export function CreateDocumentForm({ products, initialProductId, labels, failure: failureLabels }: CreateDocumentFormProps) {
  const router = useRouter();
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const input: CreateDocumentInput = {
        documentNumber: readText(formData, "documentNumber"),
        title: { tr: readText(formData, "title.tr"), en: readText(formData, "title.en") },
        productId: readText(formData, "productId"),
      };
      const result = await createDocumentAction(input);
      if (result.status === "ok") {
        router.push(`/backoffice/documents/${result.document.id}`);
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
      <TextField isRequired name="documentNumber" autoComplete="off">
        <Label>{labels.number}</Label>
        <Input className="font-mono" />
        <Description>{labels.numberHint}</Description>
        <FieldError />
      </TextField>
      <TextField isRequired name="title.tr" autoComplete="off">
        <Label>{labels.titleTr}</Label>
        <Input />
        <FieldError />
      </TextField>
      <TextField isRequired name="title.en" autoComplete="off">
        <Label>{labels.titleEn}</Label>
        <Input />
        <FieldError />
      </TextField>
      <ProductSelect
        isRequired
        name="productId"
        label={labels.product}
        placeholder={labels.productPlaceholder}
        options={products}
        defaultValue={initialProductId}
        hint={labels.productHint}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Button variant="tertiary" isDisabled={pending} onPress={() => router.push("/backoffice/documents")}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
