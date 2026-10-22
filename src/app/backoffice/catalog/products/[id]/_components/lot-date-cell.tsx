/**
 * The manufacturing date cell of a LOT row (CAT-40 rule 3, DEC-046, DEC-019,
 * FND-09.AC3).
 *
 * It shows the date in IBM Plex Mono, the source of the date as a text, and for a
 * LOT with a date conflict a marker with an icon and a text, so the conflict is
 * never shown by color alone. Under the marker, the supplied date and the date
 * that the LOT number encodes show side by side: neither has priority, and a
 * person corrects the date with a reason (CAT-41). The server formats the dates
 * (DEC-133) and passes them as text. The component has no hook, so a server
 * component renders it and passes it into the table as a cell.
 */
import { Chip } from "@heroui/react";

import { OutcomeIcon } from "../../../_components/outcome-icon";

interface LotDateCellProps {
  readonly manufacturingDate: string;
  readonly source: string;
  /** `null` for a LOT with no date conflict. */
  readonly conflict: {
    readonly label: string;
    readonly suppliedLabel: string;
    readonly supplied: string;
    readonly encodedLabel: string;
    readonly encoded: string;
  } | null;
}

export function LotDateCell({ manufacturingDate, source, conflict }: LotDateCellProps) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="font-mono">{manufacturingDate}</span>
      <span className="text-sm text-muted">{source}</span>
      {conflict === null ? null : (
        <>
          <Chip size="sm" color="warning" variant="soft">
            <OutcomeIcon kind="conflict" />
            <Chip.Label>{conflict.label}</Chip.Label>
          </Chip>
          <dl className="text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">{conflict.suppliedLabel}</dt>
              <dd className="font-mono">{conflict.supplied}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">{conflict.encodedLabel}</dt>
              <dd className="font-mono">{conflict.encoded}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
