/**
 * The state of a document version, as an icon and a text (IFU-10 *States*,
 * DEC-019).
 *
 * A composition of HeroUI's `Chip` with an inline SVG, as `StatusIcon` is. The
 * icon is `aria-hidden` and the text names the state, so the state is never shown
 * by color or by icon alone. Strong color is for problems only (DEC-019): a
 * withdrawn version is the one state that uses `warning`. The documents, the
 * product page, the LOT page and the list of overrides use it, so it is here and
 * not in one route.
 */
import { Chip } from "@heroui/react";

import type { VersionStatus } from "@/lib/schemas/eifu";

const STROKE = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A dashed circle for a draft, a check for a published version, a stack for a superseded one, a cross for a withdrawn one. */
function Shape({ status }: { readonly status: VersionStatus }) {
  switch (status) {
    case "DRAFT":
      return <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" {...STROKE} />;
    case "PUBLISHED":
      return <path d="m5 12.5 4.5 4.5L19 7.5" {...STROKE} />;
    case "SUPERSEDED":
      return <path d="M5 8h14M5 12h14M5 16h9" {...STROKE} />;
    case "WITHDRAWN":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" {...STROKE} />
          <path d="m9 9 6 6M15 9l-6 6" {...STROKE} />
        </>
      );
  }
}

interface VersionStatusChipProps {
  readonly status: VersionStatus;
  /** The Turkish or English label of the state, from the dictionary. */
  readonly label: string;
}

export function VersionStatusChip({ status, label }: VersionStatusChipProps) {
  return (
    <Chip size="sm" color={status === "WITHDRAWN" ? "warning" : "default"} variant="secondary">
      <svg aria-hidden="true" fill="none" width="14" height="14" viewBox="0 0 24 24">
        <Shape status={status} />
      </svg>
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
