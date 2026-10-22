"use client";

/**
 * The catalog numbers of one product, with add, change, move and deactivate
 * (CAT-20.AC1 to AC5, mockup `ProductDetailPage`).
 *
 * The server passes the rows as data and the permission as `canManage`; the
 * actions show only with `catalog.catalog_number.manage`. Hiding a control is not
 * authorization: each action and each service checks the permission again. The
 * section holds one status region and one failure for all its actions, so a move,
 * which removes the row from this product, is still announced. A deactivation asks
 * for a confirmation, because it cannot be undone in this release. Each button
 * that repeats in a row has the catalog number in its accessible name
 * (`sds-nextjs-frontend` §5). The catalog number is in IBM Plex Mono (FND-09.AC3).
 * The table has no minimum width, so it fits at 1024 px beside the sidebar and its
 * cells wrap (R-063). The state is an icon and a text (DEC-019).
 */
import { Chip, Typography } from "@heroui/react";
import { useState } from "react";

import { deactivateCatalogNumberAction } from "@/app/_actions/catalog";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/app/_components/data-table";
import { FailureAlert } from "@/app/_components/failure-alert";
import type { FailureLabels } from "@/app/_components/failure";
import { StatusIcon } from "@/app/_components/status-icon";
import { failureOf, useActionOutcome } from "@/app/_components/use-action-outcome";
import { fmt } from "@/lib/i18n/messages";
import type { Format } from "@/lib/schemas/catalog";

import { ConfirmDialog } from "../../../_components/confirm-dialog";
import { DoneNotice } from "../../../_components/done-notice";
import { FormDrawer } from "../../../_components/form-drawer";
import type { Option } from "../../../_lib/options";
import {
  AddCatalogNumberForm,
  EditCatalogNumberForm,
  type CatalogNumberFormLabels,
  MoveCatalogNumberForm,
  type TargetProduct,
} from "./catalog-number-forms";

export interface CatalogNumberRowData {
  readonly id: string;
  readonly catalogNumber: string;
  readonly format: Format | null;
  readonly packSize: string | null;
  readonly lotCount: number;
  readonly isActive: boolean;
}

interface CatalogNumbersSectionProps {
  readonly productId: string;
  readonly rows: readonly CatalogNumberRowData[];
  readonly canManage: boolean;
  readonly formats: readonly Option<Format>[];
  /** The products that a catalog number may move to: the active products except this one. */
  readonly targets: readonly TargetProduct[];
  readonly labels: {
    readonly table: string;
    readonly empty: string;
    readonly notSet: string;
    readonly active: string;
    readonly inactive: string;
    readonly columns: {
      readonly catalogNumber: string;
      readonly format: string;
      readonly packSize: string;
      readonly lots: string;
      readonly state: string;
      readonly actions: string;
    };
    readonly form: Omit<CatalogNumberFormLabels, "saving" | "cancel">;
    readonly saving: string;
    readonly add: {
      readonly button: string;
      readonly title: string;
      readonly submit: string;
      readonly cancel: string;
      readonly done: string;
    };
    readonly edit: {
      readonly button: string;
      readonly buttonLabel: string;
      readonly title: string;
      readonly submit: string;
      readonly cancel: string;
      readonly done: string;
    };
    readonly move: {
      readonly button: string;
      readonly buttonLabel: string;
      readonly title: string;
      readonly product: string;
      readonly placeholder: string;
      readonly hint: string;
      readonly submit: string;
      readonly cancel: string;
      readonly done: string;
    };
    readonly deactivate: {
      readonly button: string;
      readonly buttonLabel: string;
      readonly confirmTitle: string;
      readonly confirmBody: string;
      readonly confirm: string;
      readonly cancel: string;
      readonly done: string;
    };
  };
  readonly failure: FailureLabels;
}

export function CatalogNumbersSection({
  productId,
  rows,
  canManage,
  formats,
  targets,
  labels,
  failure: failureLabels,
}: CatalogNumbersSectionProps) {
  const [done, setDone] = useState<string | null>(null);
  const deactivate = useActionOutcome<string>(async (catalogNumberId) => {
    const result = await deactivateCatalogNumberAction(catalogNumberId);
    setDone(result.status === "ok" ? labels.deactivate.done : null);
    return result;
  });
  const deactivateFailure = failureOf(deactivate.state.outcome);
  const formLabels = { ...labels.form, saving: labels.saving };

  const formatText = (format: Format | null): string =>
    format === null ? labels.notSet : (formats.find((option) => option.value === format)?.label ?? labels.notSet);

  const columns: DataTableColumn[] = [
    { key: "catalogNumber", label: labels.columns.catalogNumber, isRowHeader: true, cellClassName: "font-mono break-all" },
    { key: "format", label: labels.columns.format },
    { key: "packSize", label: labels.columns.packSize, cellClassName: "break-words" },
    { key: "lots", label: labels.columns.lots, cellClassName: "tabular-nums" },
    { key: "state", label: labels.columns.state },
    ...(canManage ? [{ key: "actions", label: labels.columns.actions }] : []),
  ];
  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    cells: {
      catalogNumber: row.catalogNumber,
      format: formatText(row.format),
      packSize: row.packSize ?? labels.notSet,
      lots: String(row.lotCount),
      state: (
        <Chip size="sm" color="default" variant="secondary">
          <StatusIcon isActive={row.isActive} />
          <Chip.Label>{row.isActive ? labels.active : labels.inactive}</Chip.Label>
        </Chip>
      ),
      actions: (
        <div className="flex flex-wrap gap-2">
          <FormDrawer
            trigger={labels.edit.button}
            triggerLabel={fmt(labels.edit.buttonLabel, { catalogNumber: row.catalogNumber })}
            title={labels.edit.title}
          >
            {(close) => (
              <EditCatalogNumberForm
                catalogNumberId={row.id}
                initial={{ packSize: row.packSize ?? "", format: row.format }}
                formats={formats}
                labels={{ ...formLabels, cancel: labels.edit.cancel, submit: labels.edit.submit }}
                failure={failureLabels}
                onSaved={() => {
                  setDone(labels.edit.done);
                  close();
                }}
              />
            )}
          </FormDrawer>
          {targets.length > 0 ? (
            <FormDrawer
              trigger={labels.move.button}
              triggerLabel={fmt(labels.move.buttonLabel, { catalogNumber: row.catalogNumber })}
              title={labels.move.title}
            >
              {(close) => (
                <MoveCatalogNumberForm
                  catalogNumberId={row.id}
                  targets={targets}
                  labels={{
                    product: labels.move.product,
                    placeholder: labels.move.placeholder,
                    hint: labels.move.hint,
                    submit: labels.move.submit,
                    saving: labels.saving,
                    cancel: labels.move.cancel,
                  }}
                  failure={failureLabels}
                  onSaved={() => {
                    setDone(labels.move.done);
                    close();
                  }}
                />
              )}
            </FormDrawer>
          ) : null}
          {row.isActive ? (
            <ConfirmDialog
              trigger={labels.deactivate.button}
              triggerLabel={fmt(labels.deactivate.buttonLabel, { catalogNumber: row.catalogNumber })}
              isDisabled={deactivate.pending}
              title={labels.deactivate.confirmTitle}
              body={labels.deactivate.confirmBody}
              confirm={labels.deactivate.confirm}
              cancel={labels.deactivate.cancel}
              onConfirm={() => deactivate.submit(row.id)}
            />
          ) : null}
        </div>
      ),
    },
  }));

  return (
    <div className="flex flex-col gap-4" aria-busy={deactivate.pending}>
      {deactivateFailure === null ? null : <FailureAlert failure={deactivateFailure} labels={failureLabels} />}
      <DoneNotice message={done} />
      {canManage ? (
        <div>
          <FormDrawer trigger={labels.add.button} variant="primary" title={labels.add.title}>
            {(close) => (
              <AddCatalogNumberForm
                productId={productId}
                formats={formats}
                labels={{ ...formLabels, cancel: labels.add.cancel, submit: labels.add.submit }}
                failure={failureLabels}
                onSaved={() => {
                  setDone(labels.add.done);
                  close();
                }}
              />
            )}
          </FormDrawer>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Typography.Paragraph color="muted" size="sm">
          {labels.empty}
        </Typography.Paragraph>
      ) : (
        <DataTable ariaLabel={labels.table} columns={columns} rows={tableRows} />
      )}
    </div>
  );
}
