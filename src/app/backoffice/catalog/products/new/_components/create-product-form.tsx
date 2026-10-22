"use client";

/**
 * The form that creates a product (CAT-10.AC1 to AC3, mockup `NewProductForm`).
 *
 * It calls `createProductAction`. After a success the person goes to the page of
 * the new product. A duplicate stem and status (`RES-4300`) shows the localized
 * sentence with the code, and each field error, such as the missing name entry of
 * CAT-10.AC3, shows next to its field (DEC-122). The form does not re-validate:
 * the server does. One exception: the regulatory status has no default
 * (DEC-041), and the action takes only a status. A form with no choice makes the
 * failure `VAL-4001` for that field here, with the same fixed phrase that the
 * server uses, so the field shows the same error. Blank optional values are
 * absent values. Cancel is navigation, not a submit.
 */
import { Button, Form } from "@heroui/react";
import { useRouter } from "next/navigation";

import { createProductAction } from "@/app/_actions/catalog";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import type { CreateProductInput } from "@/lib/schemas/catalog";

import {
  PRODUCT_FIELDS,
  type ProductFieldLabels,
  ProductFormFields,
  type StatusOption,
} from "../../../_components/product-form-fields";

interface CreateProductFormProps {
  readonly statuses: readonly StatusOption[];
  readonly labels: ProductFieldLabels & {
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
}

const EMPTY_VALUES = {
  internalCode: "",
  nameTr: "",
  nameEn: "",
  descriptionTr: "",
  descriptionEn: "",
  regulatoryStatus: null,
  kitCodeBase: "",
} as const;

export function CreateProductForm({ statuses, labels, failure: failureLabels }: CreateProductFormProps) {
  const router = useRouter();
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const chosen = statuses.find((status) => status.value === readText(formData, "regulatoryStatus"));
      if (chosen === undefined) {
        return {
          status: "fail",
          code: "VAL-4001",
          message: "",
          details: [{ field: "regulatoryStatus", issue: "is required" }],
        };
      }
      const descriptionTr = readText(formData, "description.tr").trim();
      const descriptionEn = readText(formData, "description.en").trim();
      const kitCodeBase = readText(formData, "kitCodeBase").trim();
      const input: CreateProductInput = {
        internalCode: readText(formData, "internalCode"),
        name: { tr: readText(formData, "name.tr"), en: readText(formData, "name.en") },
        ...(descriptionTr === "" && descriptionEn === "" ? {} : { description: { tr: descriptionTr, en: descriptionEn } }),
        regulatoryStatus: chosen.value,
        ...(kitCodeBase === "" ? {} : { kitCodeBase }),
      };
      const result = await createProductAction(input);
      if (result.status === "ok") {
        router.push(`/backoffice/catalog/products/${result.product.id}`);
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
      {failure !== null && !hasShownFieldError(fields, PRODUCT_FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <ProductFormFields values={EMPTY_VALUES} statuses={statuses} labels={labels} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Button variant="tertiary" isDisabled={pending} onPress={() => router.push("/backoffice/catalog/products")}>
          {labels.cancel}
        </Button>
      </div>
    </Form>
  );
}
