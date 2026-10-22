"use client";

/**
 * A table that a server component fills with data (`sds-nextjs-frontend` §7).
 *
 * HeroUI's `Table` builds its collection from its children, and a function
 * cannot cross the server/client boundary. So the server passes columns and
 * rows as data, and this small client wrapper builds `Table.Row` and
 * `Table.Cell`. A cell may hold a plain element tree (a `Chip`), which crosses
 * the boundary. A row with `href` opens its page. This is a composition of
 * HeroUI parts, not a new primitive.
 */
import { Table } from "@heroui/react";
import type { ReactNode } from "react";

export interface DataTableColumn {
  readonly key: string;
  readonly label: string;
  /** Exactly one column is the row header. */
  readonly isRowHeader?: boolean;
  readonly cellClassName?: string;
}

export interface DataTableRow {
  readonly id: string;
  readonly href?: string;
  readonly cells: Readonly<Record<string, ReactNode>>;
}

interface DataTableProps {
  /** The accessible name of the table. */
  readonly ariaLabel: string;
  readonly columns: readonly DataTableColumn[];
  readonly rows: readonly DataTableRow[];
  /** The classes of the table content, for example a minimum width. */
  readonly className?: string;
}

export function DataTable({ ariaLabel, columns, rows, className }: DataTableProps) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={ariaLabel} className={className}>
          <Table.Header>
            {columns.map((column) => (
              <Table.Column key={column.key} id={column.key} isRowHeader={column.isRowHeader}>
                {column.label}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id} id={row.id} href={row.href}>
                {columns.map((column) => (
                  <Table.Cell key={column.key} className={column.cellClassName}>
                    {row.cells[column.key]}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
