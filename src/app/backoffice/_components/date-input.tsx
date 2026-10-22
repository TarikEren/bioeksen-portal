"use client";

/**
 * A field for a business date, `YYYY-MM-DD` (DEC-039, CAT-40, CAT-41).
 *
 * A composition of HeroUI's `TextField` and `Input` with `type="date"`, so the
 * browser sends the date in the form that the server reads and shows its own date
 * picker. The text of the field is in IBM Plex Mono, as a date is a business
 * identifier (DEC-016, FND-09.AC3). The server validates the date; the field
 * shows the error it returns.
 */
import { Description, FieldError, Input, Label, TextField } from "@heroui/react";

interface DateInputProps {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly defaultValue?: string;
  readonly isRequired?: boolean;
}

export function DateInput({ name, label, hint, defaultValue, isRequired = false }: DateInputProps) {
  return (
    <TextField name={name} type="date" isRequired={isRequired} defaultValue={defaultValue}>
      <Label>{label}</Label>
      <Input className="font-mono" />
      {hint === undefined ? null : <Description>{hint}</Description>}
      <FieldError />
    </TextField>
  );
}
