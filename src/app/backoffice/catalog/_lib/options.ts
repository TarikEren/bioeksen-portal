/**
 * The choices of the catalog forms, with their text from the dictionary (CAT-10,
 * CAT-20).
 *
 * A server component builds the options and passes them to a form as data, so a
 * client form never imports the schema module and never casts a form value: it
 * finds the chosen option by its value. The lists come from the constants of the
 * schemas, so a new status or format shows in the forms at once. This file is
 * pure.
 */
import type { Dictionary } from "@/lib/i18n";
import { FORMATS, type Format, REGULATORY_STATUSES, type RegulatoryStatus } from "@/lib/schemas/catalog";

export interface Option<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

export function statusOptions(text: Dictionary): readonly Option<RegulatoryStatus>[] {
  return REGULATORY_STATUSES.map((value) => ({ value, label: text.catalog.regulatoryStatus[value] }));
}

export function formatOptions(text: Dictionary): readonly Option<Format>[] {
  return FORMATS.map((value) => ({ value, label: text.catalog.format[value] }));
}
