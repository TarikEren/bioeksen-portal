"use client";

/**
 * The form that changes a document (IFU-10.AC4), in a drawer.
 *
 * It sends a JSON Merge Patch to `updateDocumentAction` (RFC 7396): the title
 * entries and, when the person changed it, the product. The product field shows
 * only while the page says that the product may change (`productChangeAllowed`,
 * IFU-10 rule 2) and the page has the product choice; after a publication the
 * form says why the product is fixed. The service refuses a new product with
 * `RES-4302` anyway, and the sentence for the code shows (DEC-122). Each field
 * error shows next to its field. The form does not re-validate: the server does.
 */
import { Button, FieldError, Form, Input, Label, TextField } from "@heroui/react";

import { updateDocumentAction } from "@/app/_actions/eifu";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import type { UpdateDocumentInput } from "@/lib/schemas/eifu";

import { type ProductOption, ProductSelect } from "../../_components/product-select";

const FIELDS = ["title.tr", "title.en", "productId"] as const;

export interface EditDocumentValues {
  readonly titleTr: string;
  readonly titleEn: string;
  readonly productId: string;
}

interface EditDocumentFormProps {
  readonly documentId: string;
  readonly values: EditDocumentValues;
  /** The products to choose from, or `null` when the product cannot change or cannot be listed. */
  readonly products: readonly ProductOption[] | null;
  readonly labels: {
    readonly titleTr: string;
    readonly titleEn: string;
    readonly product: string;
    readonly productPlaceholder: string;
    readonly productHint: string;
    readonly productLocked: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  /** Whether the document may get another product; `false` shows the reason instead of the field. */
  readonly productChangeAllowed: boolean;
  readonly failure: FailureLabels;
  /** Called after a success, with the drawer still open. */
  readonly onSaved: () => void;
}

export function EditDocumentForm({
  documentId,
  values,
  products,
  labels,
  productChangeAllowed,
  failure: failureLabels,
  onSaved,
}: EditDocumentFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const titleTr = readText(formData, "title.tr");
      const titleEn = readText(formData, "title.en");
      const productId = readText(formData, "productId");
      const title = {
        ...(titleTr !== values.titleTr ? { tr: titleTr } : {}),
        ...(titleEn !== values.titleEn ? { en: titleEn } : {}),
      };
      const patch: UpdateDocumentInput = {
        ...(Object.keys(title).length > 0 ? { title } : {}),
        ...(productId !== "" && productId !== values.productId ? { productId } : {}),
      };
      const result = await updateDocumentAction(documentId, patch);
      if (result.status === "ok") {
        onSaved();
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
      {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <TextField isRequired name="title.tr" defaultValue={values.titleTr} autoComplete="off">
        <Label>{labels.titleTr}</Label>
        <Input />
        <FieldError />
      </TextField>
      <TextField isRequired name="title.en" defaultValue={values.titleEn} autoComplete="off">
        <Label>{labels.titleEn}</Label>
        <Input />
        <FieldError />
      </TextField>
      {!productChangeAllowed ? (
        <p className="text-sm text-muted">{labels.productLocked}</p>
      ) : products === null ? null : (
        <ProductSelect
          name="productId"
          label={labels.product}
          placeholder={labels.productPlaceholder}
          options={products}
          defaultValue={values.productId}
          hint={labels.productHint}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Button slot="close" variant="tertiary" isDisabled={pending}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
