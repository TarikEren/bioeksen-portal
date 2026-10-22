"use client";

/**
 * The actions on one version: change the proposed start, publish and withdraw
 * (IFU-10 moves 2, 4 and 5, IFU-30, IFU-31).
 *
 * The page passes the state of the version and one flag for each permission, and
 * the component shows only the actions that fit both: the proposed start and the
 * publication belong to a draft, and the withdrawal belongs to a published or a
 * superseded version (IFU-10 *Moves*). This is display only. The state machine,
 * the permissions and every check of the move are in the services, and a refused
 * move shows the sentence for its code (DEC-122). Each action opens a drawer. The
 * result of a move is announced in the status region that is always rendered, and
 * the region stays when the state changes and an action leaves
 * (`sds-nextjs-frontend` §7 Forms rule 10). The page reads the new data after
 * `revalidatePath` of the action.
 */
import { useState } from "react";

import type { FailureLabels } from "@/app/_components/failure";
import { DoneNotice } from "@/app/backoffice/_components/done-notice";
import { FormDrawer } from "@/app/backoffice/_components/form-drawer";
import type { VersionStatus } from "@/lib/schemas/eifu";

import { ProposedStartForm } from "./proposed-start-form";
import { PublishForm } from "./publish-form";
import { WithdrawForm } from "./withdraw-form";

interface VersionActionsProps {
  readonly versionId: string;
  readonly status: VersionStatus;
  readonly can: { readonly manage: boolean; readonly publish: boolean; readonly withdraw: boolean };
  /** The id of the product of the document, which the publication sends back as `expectedProductId`. */
  readonly productId: string;
  readonly product: { readonly code: string; readonly status: string; readonly name: string };
  /** The proposed start, `YYYY-MM-DD`, or the empty text when there is none. */
  readonly proposedStart: string;
  readonly hasActiveFile: boolean;
  readonly labels: {
    readonly noActions: string;
    readonly proposed: {
      readonly button: string;
      readonly title: string;
      readonly label: string;
      readonly hint: string;
      readonly submit: string;
      readonly saving: string;
      readonly cancel: string;
      readonly done: string;
    };
    readonly publish: {
      readonly button: string;
      readonly title: string;
      readonly lede: string;
      readonly product: string;
      readonly effectiveFrom: string;
      readonly effectiveFromHint: string;
      readonly noFiles: string;
      readonly submit: string;
      readonly publishing: string;
      readonly cancel: string;
      readonly done: string;
      readonly doneSuperseded: string;
    };
    readonly withdraw: {
      readonly button: string;
      readonly title: string;
      readonly lede: string;
      readonly reason: string;
      readonly reasonHint: string;
      readonly reopen: string;
      readonly reopenHint: string;
      readonly submit: string;
      readonly saving: string;
      readonly cancel: string;
      readonly done: string;
      readonly doneReopened: string;
    };
  };
  readonly failure: {
    readonly proposed: FailureLabels;
    readonly publish: FailureLabels;
    readonly withdraw: FailureLabels;
  };
}

export function VersionActions({
  versionId,
  status,
  can,
  productId,
  product,
  proposedStart,
  hasActiveFile,
  labels,
  failure,
}: VersionActionsProps) {
  const [done, setDone] = useState<string | null>(null);
  const canProposeOrPublish = status === "DRAFT";
  const canWithdraw = status === "PUBLISHED" || status === "SUPERSEDED";
  const showProposed = canProposeOrPublish && can.manage;
  const showPublish = canProposeOrPublish && can.publish;
  const showWithdraw = canWithdraw && can.withdraw;

  return (
    <div className="flex flex-col gap-3">
      <DoneNotice message={done} />
      {showProposed || showPublish || showWithdraw ? (
        <div className="flex flex-wrap items-center gap-3">
          {showPublish ? (
            <FormDrawer trigger={labels.publish.button} variant="primary" title={labels.publish.title}>
              {(close) => (
                <PublishForm
                  versionId={versionId}
                  expectedProductId={productId}
                  product={product}
                  proposedStart={proposedStart}
                  hasActiveFile={hasActiveFile}
                  labels={labels.publish}
                  failure={failure.publish}
                  onPublished={(supersededAnother) => {
                    setDone(supersededAnother ? labels.publish.doneSuperseded : labels.publish.done);
                    close();
                  }}
                />
              )}
            </FormDrawer>
          ) : null}
          {showProposed ? (
            <FormDrawer trigger={labels.proposed.button} title={labels.proposed.title}>
              {(close) => (
                <ProposedStartForm
                  versionId={versionId}
                  current={proposedStart}
                  labels={labels.proposed}
                  failure={failure.proposed}
                  onSaved={() => {
                    setDone(labels.proposed.done);
                    close();
                  }}
                />
              )}
            </FormDrawer>
          ) : null}
          {showWithdraw ? (
            <FormDrawer trigger={labels.withdraw.button} variant="outline" title={labels.withdraw.title}>
              {(close) => (
                <WithdrawForm
                  versionId={versionId}
                  canReopen={status === "PUBLISHED"}
                  labels={labels.withdraw}
                  failure={failure.withdraw}
                  onWithdrawn={(reopened) => {
                    setDone(reopened ? labels.withdraw.doneReopened : labels.withdraw.done);
                    close();
                  }}
                />
              )}
            </FormDrawer>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">{labels.noActions}</p>
      )}
    </div>
  );
}
