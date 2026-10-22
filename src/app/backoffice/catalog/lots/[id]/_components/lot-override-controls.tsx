"use client";

/**
 * The controls of the override of one LOT: create one when the LOT has none, end
 * the active one when it has one (IFU-40, DEC-066, DEC-094).
 *
 * The page shows this component only to a holder of `eifu.lot_override.manage`.
 * Hiding a control is not authorization: the actions and the services check the
 * permission again. A LOT has at most one active override (IFU-40 rule 2), so the
 * page tells the component which of the two forms to show and the service holds the
 * rule. The result is announced in the status region that is always rendered, and
 * the region stays when the form gives way to the other one
 * (`sds-nextjs-frontend` §7 Forms rule 10).
 */
import { useState } from "react";

import type { FailureLabels } from "@/app/_components/failure";
import { DoneNotice } from "@/app/backoffice/_components/done-notice";
import { FormDrawer } from "@/app/backoffice/_components/form-drawer";

import { CreateOverrideForm, type VersionChoice } from "./create-override-form";
import { EndOverrideForm } from "./end-override-form";

interface LotOverrideControlsProps {
  readonly lotId: string;
  /** The id of the active override of the LOT, or `null` when it has none. */
  readonly activeOverrideId: string | null;
  /** The versions that an override may name: published or superseded versions of the product of the LOT. */
  readonly versions: readonly VersionChoice[];
  readonly labels: {
    readonly create: {
      readonly title: string;
      readonly lede: string;
      readonly version: string;
      readonly versionPlaceholder: string;
      readonly noVersions: string;
      readonly reason: string;
      readonly reasonHint: string;
      readonly submit: string;
      readonly saving: string;
      readonly done: string;
    };
    readonly end: {
      readonly button: string;
      readonly title: string;
      readonly lede: string;
      readonly reason: string;
      readonly reasonHint: string;
      readonly submit: string;
      readonly saving: string;
      readonly cancel: string;
      readonly done: string;
    };
  };
  readonly failure: { readonly create: FailureLabels; readonly end: FailureLabels };
}

export function LotOverrideControls({ lotId, activeOverrideId, versions, labels, failure }: LotOverrideControlsProps) {
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <DoneNotice message={done} />
      {activeOverrideId !== null ? (
        <div>
          <FormDrawer trigger={labels.end.button} variant="outline" title={labels.end.title}>
            {(close) => (
              <EndOverrideForm
                overrideId={activeOverrideId}
                labels={labels.end}
                failure={failure.end}
                onEnded={() => {
                  setDone(labels.end.done);
                  close();
                }}
              />
            )}
          </FormDrawer>
        </div>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted">{labels.create.noVersions}</p>
      ) : (
        <CreateOverrideForm
          lotId={lotId}
          versions={versions}
          labels={labels.create}
          failure={failure.create}
          onCreated={() => setDone(labels.create.done)}
        />
      )}
    </div>
  );
}
