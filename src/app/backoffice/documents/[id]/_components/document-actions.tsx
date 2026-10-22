"use client";

/**
 * The actions on one document: change it, and open a new draft version
 * (IFU-10.AC3, AC4, mockup `DocumentProductPanel` and `NewRevisionForm`).
 *
 * The page shows this component only to a holder of `eifu.document.manage`.
 * Hiding a button is not authorization: the actions and the services check the
 * permission again. Each action opens a drawer with its form. A change that stays
 * on the page is announced in the status region that is always rendered
 * (`sds-nextjs-frontend` §7 Forms rule 10), and the page reads the new data after
 * `revalidatePath` of the action. A new version goes to the page of the version.
 */
import { useState } from "react";

import type { FailureLabels } from "@/app/_components/failure";
import { DoneNotice } from "@/app/backoffice/_components/done-notice";
import { FormDrawer } from "@/app/backoffice/_components/form-drawer";

import type { ProductOption } from "../../_components/product-select";
import { EditDocumentForm, type EditDocumentValues } from "./edit-document-form";
import { NewVersionForm } from "./new-version-form";

interface DocumentActionsProps {
  readonly documentId: string;
  readonly values: EditDocumentValues;
  readonly productChangeAllowed: boolean;
  /** The products to choose from, or `null` when the person may not list the catalog. */
  readonly products: readonly ProductOption[] | null;
  readonly labels: {
    readonly edit: {
      readonly button: string;
      readonly title: string;
      readonly titleTr: string;
      readonly titleEn: string;
      readonly product: string;
      readonly productPlaceholder: string;
      readonly productHint: string;
      readonly productLocked: string;
      readonly submit: string;
      readonly saving: string;
      readonly cancel: string;
      readonly done: string;
    };
    readonly newVersion: {
      readonly button: string;
      readonly title: string;
      readonly lede: string;
      readonly revision: string;
      readonly revisionHint: string;
      readonly proposedStart: string;
      readonly proposedStartHint: string;
      readonly submit: string;
      readonly saving: string;
      readonly cancel: string;
    };
  };
  readonly editFailure: FailureLabels;
  readonly versionFailure: FailureLabels;
}

export function DocumentActions({
  documentId,
  values,
  productChangeAllowed,
  products,
  labels,
  editFailure,
  versionFailure,
}: DocumentActionsProps) {
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <DoneNotice message={done} />
      <div className="flex flex-wrap items-center gap-3">
        <FormDrawer trigger={labels.newVersion.button} variant="primary" title={labels.newVersion.title}>
          {() => <NewVersionForm documentId={documentId} labels={labels.newVersion} failure={versionFailure} />}
        </FormDrawer>
        <FormDrawer trigger={labels.edit.button} title={labels.edit.title}>
          {(close) => (
            <EditDocumentForm
              documentId={documentId}
              values={values}
              products={products}
              productChangeAllowed={productChangeAllowed}
              labels={labels.edit}
              failure={editFailure}
              onSaved={() => {
                setDone(labels.edit.done);
                close();
              }}
            />
          )}
        </FormDrawer>
      </div>
    </div>
  );
}
