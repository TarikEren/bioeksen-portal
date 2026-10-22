"use client";

/**
 * The fields of a product (CAT-10, DEC-040, DEC-041, DEC-011), for the form that
 * creates a product and the drawer that changes one.
 *
 * A composition of HeroUI's `TextField`, `TextArea` and `Select`. The product
 * code and the kit code base are business identifiers, so their text is in IBM
 * Plex Mono (FND-09.AC3, DEC-016). The regulatory status has no default: a new
 * product starts with no choice (DEC-041), and a changed product starts with its
 * own status. The server validates each value and answers the errors that the
 * form shows through `validationErrors` of the `Form` around these fields.
 */
import { Description, FieldError, Input, Label, ListBox, Select, TextArea, TextField } from "@heroui/react";

import type { RegulatoryStatus } from "@/lib/schemas/catalog";

export interface StatusOption {
  readonly value: RegulatoryStatus;
  readonly label: string;
}

/** The names of the fields, as the server names them in `details`. */
export const PRODUCT_FIELDS = [
  "internalCode",
  "name.tr",
  "name.en",
  "description.tr",
  "description.en",
  "regulatoryStatus",
  "kitCodeBase",
] as const;

export interface ProductFieldValues {
  readonly internalCode: string;
  readonly nameTr: string;
  readonly nameEn: string;
  readonly descriptionTr: string;
  readonly descriptionEn: string;
  readonly regulatoryStatus: RegulatoryStatus | null;
  readonly kitCodeBase: string;
}

export interface ProductFieldLabels {
  readonly internalCode: string;
  readonly nameTr: string;
  readonly nameEn: string;
  readonly descriptionTr: string;
  readonly descriptionEn: string;
  readonly descriptionHint: string;
  readonly regulatoryStatus: string;
  readonly regulatoryPlaceholder: string;
  readonly kitCodeBase: string;
  readonly kitCodeBaseHint: string;
}

interface ProductFormFieldsProps {
  readonly values: ProductFieldValues;
  readonly statuses: readonly StatusOption[];
  readonly labels: ProductFieldLabels;
  /** Disables the product code and the regulatory status of a product with a LOT (CAT-10 rule 3). */
  readonly identityLocked?: boolean;
}

export function ProductFormFields({ values, statuses, labels, identityLocked = false }: ProductFormFieldsProps) {
  return (
    <>
      <TextField isRequired name="internalCode" defaultValue={values.internalCode} isDisabled={identityLocked} autoComplete="off">
        <Label>{labels.internalCode}</Label>
        <Input className="font-mono" />
        <FieldError />
      </TextField>
      <TextField isRequired name="name.tr" defaultValue={values.nameTr} autoComplete="off">
        <Label>{labels.nameTr}</Label>
        <Input />
        <FieldError />
      </TextField>
      <TextField isRequired name="name.en" defaultValue={values.nameEn} autoComplete="off">
        <Label>{labels.nameEn}</Label>
        <Input />
        <FieldError />
      </TextField>
      <TextField name="description.tr" defaultValue={values.descriptionTr}>
        <Label>{labels.descriptionTr}</Label>
        <TextArea rows={3} />
        <FieldError />
      </TextField>
      <TextField name="description.en" defaultValue={values.descriptionEn}>
        <Label>{labels.descriptionEn}</Label>
        <TextArea rows={3} />
        <Description>{labels.descriptionHint}</Description>
        <FieldError />
      </TextField>
      <Select
        isRequired
        name="regulatoryStatus"
        defaultValue={values.regulatoryStatus}
        isDisabled={identityLocked}
        placeholder={labels.regulatoryPlaceholder}
      >
        <Label>{labels.regulatoryStatus}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {statuses.map((status) => (
              <ListBox.Item key={status.value} id={status.value} textValue={status.label}>
                {status.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <FieldError />
      </Select>
      <TextField name="kitCodeBase" defaultValue={values.kitCodeBase} autoComplete="off">
        <Label>{labels.kitCodeBase}</Label>
        <Input className="font-mono" />
        <Description>{labels.kitCodeBaseHint}</Description>
        <FieldError />
      </TextField>
    </>
  );
}
