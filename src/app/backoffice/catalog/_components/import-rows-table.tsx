/**
 * The rows of an import, with the outcome and the reason of each row (CAT-60
 * rule 6, rule 10, DEC-019).
 *
 * A composition of the shared `DataTable`. The preview and the report both use
 * it. The three cells are the cells as they arrived, before transport cleanup
 * (rule 10), in IBM Plex Mono because they are catalog numbers, LOT numbers and
 * dates (FND-09.AC3). The outcome is a chip with an icon and a text, and the
 * reason is a sentence under it, so no state is shown by color alone. The table
 * has no minimum width, so it fits at 1024 px beside the sidebar and the cells
 * wrap (R-063). The component has no hook, so a server component and a client
 * component both render it.
 */
import { Chip } from "@heroui/react";

import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import type { Outcome, Reason } from "@/lib/schemas/catalog";

import { OUTCOME_LOOK } from "./import-outcome";
import { OutcomeIcon } from "./outcome-icon";

export interface ImportRowData {
  readonly rowNumber: number;
  readonly rawCells: {
    readonly catalogNumber?: string;
    readonly lotNumber?: string;
    readonly manufacturingDate?: string;
  };
  readonly outcome: Outcome;
  readonly reason: Reason | null;
}

interface ImportRowsTableProps {
  readonly ariaLabel: string;
  readonly rows: readonly ImportRowData[];
  readonly labels: {
    readonly columns: {
      readonly row: string;
      readonly catalogNumber: string;
      readonly lotNumber: string;
      readonly manufacturingDate: string;
      readonly outcome: string;
    };
    readonly outcome: Readonly<Record<Outcome, string>>;
    readonly reason: Readonly<Record<Reason, string>>;
    /** The text of a cell that has no value. */
    readonly empty: string;
  };
}

function Raw({ value, empty }: { readonly value: string | undefined; readonly empty: string }) {
  return value === undefined || value === "" ? (
    <span className="text-muted">{empty}</span>
  ) : (
    // A raw cell keeps its spaces and its case, so it is shown as data (CAT-60 rule 10).
    <span className="font-mono break-all whitespace-pre-wrap">{value}</span>
  );
}

export function ImportRowsTable({ ariaLabel, rows, labels }: ImportRowsTableProps) {
  const columns: DataTableColumn[] = [
    { key: "row", label: labels.columns.row, isRowHeader: true, cellClassName: "tabular-nums" },
    { key: "catalogNumber", label: labels.columns.catalogNumber },
    { key: "lotNumber", label: labels.columns.lotNumber },
    { key: "manufacturingDate", label: labels.columns.manufacturingDate },
    { key: "outcome", label: labels.columns.outcome },
  ];
  const tableRows: DataTableRow[] = rows.map((row) => {
    const look = OUTCOME_LOOK[row.outcome];
    return {
      id: String(row.rowNumber),
      cells: {
        row: String(row.rowNumber),
        catalogNumber: <Raw value={row.rawCells.catalogNumber} empty={labels.empty} />,
        lotNumber: <Raw value={row.rawCells.lotNumber} empty={labels.empty} />,
        manufacturingDate: <Raw value={row.rawCells.manufacturingDate} empty={labels.empty} />,
        outcome: (
          <div className="flex flex-col items-start gap-1">
            <Chip size="sm" color={look.color} variant={look.color === "default" ? "secondary" : "soft"}>
              <OutcomeIcon kind={look.icon} />
              <Chip.Label>{labels.outcome[row.outcome]}</Chip.Label>
            </Chip>
            {row.reason === null ? null : <span className="text-sm text-muted">{labels.reason[row.reason]}</span>}
          </div>
        ),
      },
    };
  });
  return <DataTable ariaLabel={ariaLabel} columns={columns} rows={tableRows} />;
}
