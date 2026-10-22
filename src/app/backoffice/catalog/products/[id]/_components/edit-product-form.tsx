"use client";

/**
 * The form that changes a product (CAT-10.AC4), in a drawer.
 *
 * It sends a JSON Merge Patch to `updateProductAction` (RFC 7396): only the
 * values that the person changed. A blank optional value that had text becomes
 * `null`, which removes it. The stem and the regulatory status are disabled for a
 * product with a LOT, as the page says; the service refuses the change with
 * `RES-4302` anyway, and the sentence for the code shows (DEC-122). Each field
 * error shows next to its field. The form does not re-validate: the server does.
 * After a success the drawer closes and the page tells the person through its
 * status region.
 */
import { Button, Form } from "@heroui/react";

import { updateProductAction } from "@/app/_actions/catalog";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import type { UpdateProductInput } from "@/lib/schemas/catalog";

import {
  PRODUCT_FIELDS,
  type ProductFieldLabels,
  type ProductFieldValues,
  ProductFormFields,
  type StatusOption,
} from "../../../_components/product-form-fields";

interface EditProductFormProps {
  readonly productId: string;
  readonly values: ProductFieldValues;
  readonly identityLocked: boolean;
  readonly statuses: readonly StatusOption[];
  readonly labels: ProductFieldLabels & {
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
  /** Called after a success, with the drawer still open. */
  readonly onSaved: () => void;
}

export function EditProductForm({
  productId,
  values,
  identityLocked,
  statuses,
  labels,
  failure: failureLabels,
  onSaved,
}: EditProductFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const nameTr = readText(formData, "name.tr");
      const nameEn = readText(formData, "name.en");
      const descriptionTr = readText(formData, "description.tr");
      const descriptionEn = readText(formData, "description.en");
      const kitCodeBase = readText(formData, "kitCodeBase").trim();
      const internalCode = readText(formData, "internalCode");
      const chosen = statuses.find((status) => status.value === readText(formData, "regulatoryStatus"));

      const name = {
        ...(nameTr !== values.nameTr ? { tr: nameTr } : {}),
        ...(nameEn !== values.nameEn ? { en: nameEn } : {}),
      };
      const descriptionChanged = descriptionTr !== values.descriptionTr || descriptionEn !== values.descriptionEn;
      const patch: UpdateProductInput = {
        ...(!identityLocked && internalCode !== values.internalCode ? { internalCode } : {}),
        ...(Object.keys(name).length > 0 ? { name } : {}),
        ...(descriptionChanged
          ? { description: descriptionTr.trim() === "" && descriptionEn.trim() === "" ? null : { tr: descriptionTr, en: descriptionEn } }
          : {}),
        ...(!identityLocked && chosen !== undefined && chosen.value !== values.regulatoryStatus
          ? { regulatoryStatus: chosen.value }
          : {}),
        ...(kitCodeBase !== values.kitCodeBase ? { kitCodeBase: kitCodeBase === "" ? null : kitCodeBase } : {}),
      };
      const result = await updateProductAction(productId, patch);
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
      {failure !== null && !hasShownFieldError(fields, PRODUCT_FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <ProductFormFields values={values} statuses={statuses} labels={labels} identityLocked={identityLocked} />
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
