"use client";

/**
 * The three forms of a catalog number: add, change and move (CAT-20.AC1 to AC4,
 * mockup `NewCatalogNumberForm`).
 *
 * Each form is a HeroUI `Form` in a drawer. It calls its server action and shows
 * the failure as the localized sentence for the code with the code beside it, and
 * each field error next to its field (DEC-122). The forms do not re-validate: the
 * server cleans the catalog number once (CAT-20 rule 2) and checks it. The change
 * and the move send a JSON Merge Patch (RFC 7396) with the values that changed.
 * A move to a product is refused with `RES-4302` while the catalog number has a
 * LOT (CAT-20.AC4). The catalog number is in IBM Plex Mono (FND-09.AC3). After a
 * success the drawer closes and the section tells the person through its status
 * region.
 */
import { Button, Description, FieldError, Form, Input, Label, ListBox, Select, TextField } from "@heroui/react";

import { addCatalogNumberAction, updateCatalogNumberAction } from "@/app/_actions/catalog";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import type { CatalogNumberInput, Format, UpdateCatalogNumberInput } from "@/lib/schemas/catalog";

import type { Option } from "../../../_lib/options";

export interface TargetProduct {
  readonly id: string;
  /** The stem and the regulatory status, as data of the product. */
  readonly label: string;
}

/** The key of the choice "no format" in the select. */
const NO_FORMAT = "none";

export interface CatalogNumberFormLabels {
  readonly catalogNumber: string;
  readonly packSize: string;
  readonly format: string;
  readonly formatPlaceholder: string;
  readonly noFormat: string;
  readonly saving: string;
  readonly cancel: string;
}

interface FormatFieldProps {
  readonly formats: readonly Option<Format>[];
  readonly defaultKey: string;
  readonly labels: CatalogNumberFormLabels;
}

function FormatField({ formats, defaultKey, labels }: FormatFieldProps) {
  return (
    <Select name="format" defaultValue={defaultKey} placeholder={labels.formatPlaceholder}>
      <Label>{labels.format}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id={NO_FORMAT} textValue={labels.noFormat}>
            {labels.noFormat}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {formats.map((format) => (
            <ListBox.Item key={format.value} id={format.value} textValue={format.label}>
              {format.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      <FieldError />
    </Select>
  );
}

interface FormFooterProps {
  readonly submit: string;
  readonly pending: boolean;
  readonly labels: CatalogNumberFormLabels;
}

function FormFooter({ submit, pending, labels }: FormFooterProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" variant="primary" isDisabled={pending}>
        {pending ? labels.saving : submit}
      </Button>
      <Button slot="close" variant="tertiary" isDisabled={pending}>
        {labels.cancel}
      </Button>
    </div>
  );
}

interface AddCatalogNumberFormProps {
  readonly productId: string;
  readonly formats: readonly Option<Format>[];
  readonly labels: CatalogNumberFormLabels & { readonly submit: string };
  readonly failure: FailureLabels;
  readonly onSaved: () => void;
}

const ADD_FIELDS = ["catalogNumber", "packSize", "format"] as const;

export function AddCatalogNumberForm({ productId, formats, labels, failure: failureLabels, onSaved }: AddCatalogNumberFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const packSize = readText(formData, "packSize").trim();
      const format = formats.find((option) => option.value === readText(formData, "format"));
      const input: CatalogNumberInput = {
        catalogNumber: readText(formData, "catalogNumber"),
        ...(packSize === "" ? {} : { packSize }),
        ...(format === undefined ? {} : { format: format.value }),
      };
      const result = await addCatalogNumberAction(productId, input);
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
      {failure !== null && !hasShownFieldError(fields, ADD_FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <TextField isRequired name="catalogNumber" autoComplete="off">
        <Label>{labels.catalogNumber}</Label>
        <Input className="font-mono" />
        <FieldError />
      </TextField>
      <TextField name="packSize" autoComplete="off">
        <Label>{labels.packSize}</Label>
        <Input />
        <FieldError />
      </TextField>
      <FormatField formats={formats} defaultKey={NO_FORMAT} labels={labels} />
      <FormFooter submit={labels.submit} pending={pending} labels={labels} />
    </Form>
  );
}

interface EditCatalogNumberFormProps {
  readonly catalogNumberId: string;
  readonly initial: { readonly packSize: string; readonly format: Format | null };
  readonly formats: readonly Option<Format>[];
  readonly labels: CatalogNumberFormLabels & { readonly submit: string };
  readonly failure: FailureLabels;
  readonly onSaved: () => void;
}

const EDIT_FIELDS = ["packSize", "format"] as const;

export function EditCatalogNumberForm({
  catalogNumberId,
  initial,
  formats,
  labels,
  failure: failureLabels,
  onSaved,
}: EditCatalogNumberFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const packSize = readText(formData, "packSize").trim();
      const format = formats.find((option) => option.value === readText(formData, "format"));
      const patch: UpdateCatalogNumberInput = {
        ...(packSize !== initial.packSize ? { packSize: packSize === "" ? null : packSize } : {}),
        ...((format?.value ?? null) !== initial.format ? { format: format?.value ?? null } : {}),
      };
      const result = await updateCatalogNumberAction(catalogNumberId, patch);
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
      {failure !== null && !hasShownFieldError(fields, EDIT_FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <TextField name="packSize" defaultValue={initial.packSize} autoComplete="off">
        <Label>{labels.packSize}</Label>
        <Input />
        <FieldError />
      </TextField>
      <FormatField formats={formats} defaultKey={initial.format ?? NO_FORMAT} labels={labels} />
      <FormFooter submit={labels.submit} pending={pending} labels={labels} />
    </Form>
  );
}

interface MoveCatalogNumberFormProps {
  readonly catalogNumberId: string;
  readonly targets: readonly TargetProduct[];
  readonly labels: {
    readonly product: string;
    readonly placeholder: string;
    readonly hint: string;
    readonly submit: string;
    readonly saving: string;
    readonly cancel: string;
  };
  readonly failure: FailureLabels;
  readonly onSaved: () => void;
}

const MOVE_FIELDS = ["productId"] as const;

export function MoveCatalogNumberForm({
  catalogNumberId,
  targets,
  labels,
  failure: failureLabels,
  onSaved,
}: MoveCatalogNumberFormProps) {
  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const target = targets.find((candidate) => candidate.id === readText(formData, "productId"));
      if (target === undefined) {
        // A form with no choice has no target. The fixed phrase is the one of the server.
        return { status: "fail", code: "VAL-4001", message: "", details: [{ field: "productId", issue: "is required" }] };
      }
      const result = await updateCatalogNumberAction(catalogNumberId, { productId: target.id });
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
      {failure !== null && !hasShownFieldError(fields, MOVE_FIELDS) ? (
        <FailureAlert failure={failure} labels={failureLabels} />
      ) : null}
      <Select isRequired name="productId" placeholder={labels.placeholder}>
        <Label>{labels.product}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {targets.map((target) => (
              <ListBox.Item key={target.id} id={target.id} textValue={target.label}>
                <span className="font-mono">{target.label}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <Description>{labels.hint}</Description>
        <FieldError />
      </Select>
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
