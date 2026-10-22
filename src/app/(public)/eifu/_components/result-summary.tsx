/**
 * The facts of a lookup result as a list of label and value (IFU-70 rule 4,
 * IFU-70.AC3).
 *
 * A composition of the semantic `dl`, which HeroUI has no component for. A value
 * that is an identifier or a date is in IBM Plex Mono on one line (DEC-016,
 * FND-09.AC3): a long value scrolls inside its own cell and never widens the page.
 * It has no color for a state: finding the document is the normal outcome, so the
 * list shows no success color (DEC-019). A server component and a client component
 * both render it.
 */
import { Fragment } from "react";

export interface SummaryRow {
  readonly label: string;
  readonly value: string;
  /** An identifier or a date: IBM Plex Mono on one line. Names are not. */
  readonly identifier: boolean;
}

interface ResultSummaryProps {
  readonly rows: readonly SummaryRow[];
}

export function ResultSummary({ rows }: ResultSummaryProps) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-y-3">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt className="text-sm text-muted sm:pt-0.5">{row.label}</dt>
          <dd className={row.identifier ? "min-w-0 overflow-x-auto font-mono whitespace-nowrap" : "min-w-0 break-words"}>
            {row.value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
