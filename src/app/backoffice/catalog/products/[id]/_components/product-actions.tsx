"use client";

/**
 * The actions on one product: change and deactivate (CAT-10.AC4, AC5, mockup
 * `ProductDetailPage`).
 *
 * The page shows this component only to a holder of `catalog.product.manage`,
 * and only the actions that fit the state of the product (`canDeactivate`).
 * Hiding a button is not authorization: the service checks the permission again.
 * A deactivation hides the product from the choice lists and cannot be undone in
 * this release, so it asks for a confirmation (`ConfirmDialog`). A failure shows
 * with `role="alert"` and the localized sentence for its code with the code
 * beside it (DEC-122). A success is announced in the status region that is
 * always rendered (`sds-nextjs-frontend` §7 Forms rule 10).
 */
import { Typography } from "@heroui/react";
import { useState } from "react";

import { deactivateProductAction } from "@/app/_actions/catalog";
import { FailureAlert } from "@/app/_components/failure-alert";
import type { FailureLabels } from "@/app/_components/failure";
import { failureOf, useActionOutcome } from "@/app/_components/use-action-outcome";

import { ConfirmDialog } from "../../../_components/confirm-dialog";
import { DoneNotice } from "../../../_components/done-notice";
import { FormDrawer } from "../../../_components/form-drawer";
import type { ProductFieldLabels, ProductFieldValues, StatusOption } from "../../../_components/product-form-fields";
import { EditProductForm } from "./edit-product-form";

interface ProductActionsProps {
  readonly productId: string;
  readonly values: ProductFieldValues;
  readonly identityLocked: boolean;
  readonly canDeactivate: boolean;
  readonly statuses: readonly StatusOption[];
  readonly labels: {
    readonly edit: ProductFieldLabels & {
      readonly button: string;
      readonly title: string;
      readonly submit: string;
      readonly saving: string;
      readonly cancel: string;
      readonly done: string;
    };
    readonly deactivate: {
      readonly button: string;
      readonly hint: string;
      readonly confirmTitle: string;
      readonly confirmBody: string;
      readonly confirm: string;
      readonly cancel: string;
      readonly done: string;
    };
  };
  readonly failure: FailureLabels;
}

export function ProductActions({
  productId,
  values,
  identityLocked,
  canDeactivate,
  statuses,
  labels,
  failure: failureLabels,
}: ProductActionsProps) {
  const [done, setDone] = useState<string | null>(null);
  const deactivate = useActionOutcome<void>(async () => {
    const result = await deactivateProductAction(productId);
    setDone(result.status === "ok" ? labels.deactivate.done : null);
    return result;
  });
  const deactivateFailure = failureOf(deactivate.state.outcome);

  return (
    <div className="flex flex-col gap-4" aria-busy={deactivate.pending}>
      {deactivateFailure === null ? null : <FailureAlert failure={deactivateFailure} labels={failureLabels} />}
      <DoneNotice message={done} />
      <div className="flex flex-wrap items-center gap-3">
        <FormDrawer trigger={labels.edit.button} title={labels.edit.title}>
          {(close) => (
            <EditProductForm
              productId={productId}
              values={values}
              identityLocked={identityLocked}
              statuses={statuses}
              labels={labels.edit}
              failure={failureLabels}
              onSaved={() => {
                setDone(labels.edit.done);
                close();
              }}
            />
          )}
        </FormDrawer>
        {canDeactivate ? (
          <ConfirmDialog
            trigger={labels.deactivate.button}
            isDisabled={deactivate.pending}
            title={labels.deactivate.confirmTitle}
            body={labels.deactivate.confirmBody}
            confirm={labels.deactivate.confirm}
            cancel={labels.deactivate.cancel}
            onConfirm={() => deactivate.submit()}
          />
        ) : null}
      </div>
      {canDeactivate ? (
        <Typography.Paragraph color="muted" size="sm">
          {labels.deactivate.hint}
        </Typography.Paragraph>
      ) : null}
    </div>
  );
}
