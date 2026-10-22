/**
 * How the outcome of an import row shows (CAT-60 rule 6, DEC-019).
 *
 * Each outcome has one icon, and one chip color for the kinds that need a
 * person: `warning` for a conflict and `danger` for an invalid row. The other
 * outcomes are neutral, because the interface uses strong color only for
 * problems (DEC-019). The map is exhaustive on `Outcome`, so a new outcome fails
 * the type check. This file is pure.
 */
import type { Outcome } from "@/lib/schemas/catalog";

import type { OutcomeIconKind } from "./outcome-icon";

export interface OutcomeLook {
  readonly icon: OutcomeIconKind;
  readonly color: "default" | "warning" | "danger";
}

export const OUTCOME_LOOK: Readonly<Record<Outcome, OutcomeLook>> = {
  CREATED: { icon: "created", color: "default" },
  ALREADY_EXISTS: { icon: "existing", color: "default" },
  CONFLICT_REVIEW_REQUIRED: { icon: "conflict", color: "warning" },
  INVALID_CATALOG_NUMBER: { icon: "invalid", color: "danger" },
  INVALID_LOT_FORMAT: { icon: "invalid", color: "danger" },
  INVALID_DATE: { icon: "invalid", color: "danger" },
};
