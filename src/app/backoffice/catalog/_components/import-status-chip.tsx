/**
 * The status of an import as a chip with an icon and a text (CAT-60 rule 8,
 * DEC-019).
 *
 * `COMPLETED` means that the import ended, not that it created each row, so it
 * is neutral. `FAILED` is a problem and uses the `danger` color with a cross.
 * `PROCESSING` has a clock. The chip never shows a state by color alone. The
 * map is exhaustive on `ImportStatus`, so a new status fails the type check. The
 * component has no hook, so a server component renders it into a table cell.
 */
import { Chip } from "@heroui/react";

import type { ImportStatus } from "@/lib/schemas/catalog";

import { OutcomeIcon, type OutcomeIconKind } from "./outcome-icon";

const LOOK: Readonly<Record<ImportStatus, { readonly icon: OutcomeIconKind; readonly color: "default" | "danger" }>> = {
  PROCESSING: { icon: "processing", color: "default" },
  COMPLETED: { icon: "created", color: "default" },
  FAILED: { icon: "invalid", color: "danger" },
};

interface ImportStatusChipProps {
  readonly status: ImportStatus;
  /** The text of the status in the active language. */
  readonly label: string;
}

export function ImportStatusChip({ status, label }: ImportStatusChipProps) {
  const look = LOOK[status];
  return (
    <Chip size="sm" color={look.color} variant={look.color === "default" ? "secondary" : "soft"}>
      <OutcomeIcon kind={look.icon} />
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
