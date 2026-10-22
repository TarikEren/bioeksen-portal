"use client";

/**
 * The choice of a product in a document form (IFU-10 rule 2, DEC-060).
 *
 * A composition of HeroUI's `Select` and `ListBox`. A product is identified by
 * its stem and its regulatory status together (DEC-040), so each option shows
 * both, and the stem is in IBM Plex Mono (DEC-016). The page passes the options
 * as data with their text already filled, so this client component imports
 * neither a dictionary nor a schema. The server validates the id that the form
 * sends: a choice that names no product is 400 `VAL-4006` on `productId`.
 */
import { Description, FieldError, Label, ListBox, Select } from "@heroui/react";

export interface ProductOption {
  readonly id: string;
  /** The stem of the product. */
  readonly code: string;
  /** The text of the regulatory status. */
  readonly status: string;
  /** The name of the product in the active language. */
  readonly name: string;
}

interface ProductSelectProps {
  readonly name: string;
  readonly label: string;
  readonly placeholder: string;
  readonly options: readonly ProductOption[];
  /** The id of the chosen product, or `null` for no choice. */
  readonly defaultValue: string | null;
  readonly hint?: string;
  readonly isRequired?: boolean;
}

export function ProductSelect({ name, label, placeholder, options, defaultValue, hint, isRequired = false }: ProductSelectProps) {
  return (
    <Select isRequired={isRequired} name={name} defaultValue={defaultValue} placeholder={placeholder}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={`${option.code} ${option.status} ${option.name}`}>
              <span className="font-mono">{option.code}</span> <span>{option.status}</span>{" "}
              <span className="text-muted">{option.name}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      {hint === undefined ? null : <Description>{hint}</Description>}
      <FieldError />
    </Select>
  );
}
