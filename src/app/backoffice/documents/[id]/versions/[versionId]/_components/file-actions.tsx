"use client";

/**
 * The actions on one file of a version: download, remove and replace (IFU-20
 * rule 6, IFU-32, DEC-093, DEC-092).
 *
 * The page passes one flag for each action, from the state of the version and the
 * permissions of the person. This is display only: the services check the state
 * and the permission again, and a refused action shows the sentence for its code
 * (DEC-122). The download asks the route `GET document-files/{id}/download-url` for
 * a signed URL (DEC-093) and opens it as a download in the same tab. The URL is
 * outside data, so it is read with a schema, and only an `http:` or `https:` URL
 * is opened (`sds-nextjs-frontend` §2); the signed URL lives for 5 minutes, so it
 * is asked for at the click and never kept. The removal of a file asks for a
 * confirmation. Each button names the language of its file, because the buttons
 * repeat in each row. The result of an action is announced in the status region
 * that is always rendered.
 */
import { Button } from "@heroui/react";
import { useState } from "react";
import { z } from "zod";

import { deactivateFileAction } from "@/app/_actions/eifu";
import type { FailureLabels } from "@/app/_components/failure";
import { FailureAlert } from "@/app/_components/failure-alert";
import { failureOf, useActionOutcome } from "@/app/_components/use-action-outcome";
import { parseEnvelope } from "@/app/_lib/read-envelope";
import { ConfirmDialog } from "@/app/backoffice/_components/confirm-dialog";
import { DoneNotice } from "@/app/backoffice/_components/done-notice";
import { FormDrawer } from "@/app/backoffice/_components/form-drawer";

import { ReplaceFileForm } from "./replace-file-form";

/** The answer of the download route: the signed URL (DEC-093). */
const DownloadBody = z.looseObject({ status: z.literal("ok"), url: z.string() });

/** Opens a signed URL as a download. Only `http:` and `https:` are opened. @throws TypeError for a URL that is not one. */
function startDownload(url: string): void {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new TypeError("The download URL is not an http or https URL");
  }
  const link = window.document.createElement("a");
  link.href = target.href;
  link.rel = "noopener noreferrer";
  link.click();
}

interface FileActionsProps {
  readonly fileId: string;
  readonly canDeactivate: boolean;
  readonly canReplace: boolean;
  readonly labels: {
    readonly download: { readonly button: string; readonly buttonLabel: string; readonly preparing: string };
    readonly deactivate: {
      readonly button: string;
      readonly buttonLabel: string;
      readonly confirmTitle: string;
      readonly confirmBody: string;
      readonly confirm: string;
      readonly cancel: string;
      readonly done: string;
    };
    readonly replace: {
      readonly button: string;
      readonly buttonLabel: string;
      readonly title: string;
      readonly lede: string;
      readonly reason: string;
      readonly reasonHint: string;
      readonly file: string;
      readonly fileHint: string;
      readonly submit: string;
      readonly uploading: string;
      readonly cancel: string;
      readonly done: string;
    };
  };
  readonly failure: {
    readonly download: FailureLabels;
    readonly deactivate: FailureLabels;
    readonly replace: FailureLabels;
  };
}

export function FileActions({ fileId, canDeactivate, canReplace, labels, failure }: FileActionsProps) {
  const [done, setDone] = useState<string | null>(null);

  const download = useActionOutcome<void>(async () => {
    const response = await fetch(`/api/v1/eifu/document-files/${encodeURIComponent(fileId)}/download-url`, {
      credentials: "same-origin",
    });
    const body: unknown = await response.json();
    const ok = DownloadBody.safeParse(body);
    if (!ok.success) {
      return parseEnvelope(body);
    }
    startDownload(ok.data.url);
    return { status: "ok" };
  });
  const deactivate = useActionOutcome<void>(async () => {
    const result = await deactivateFileAction(fileId);
    setDone(result.status === "ok" ? labels.deactivate.done : null);
    return result;
  });
  const downloadFailure = failureOf(download.state.outcome);
  const deactivateFailure = failureOf(deactivate.state.outcome);

  return (
    <div className="flex flex-col gap-2" aria-busy={download.pending || deactivate.pending}>
      {downloadFailure === null ? null : <FailureAlert failure={downloadFailure} labels={failure.download} />}
      {deactivateFailure === null ? null : <FailureAlert failure={deactivateFailure} labels={failure.deactivate} />}
      <DoneNotice message={done} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          aria-label={labels.download.buttonLabel}
          isDisabled={download.pending}
          onPress={() => download.submit()}
        >
          {download.pending ? labels.download.preparing : labels.download.button}
        </Button>
        {canReplace ? (
          <FormDrawer trigger={labels.replace.button} triggerLabel={labels.replace.buttonLabel} title={labels.replace.title}>
            {(close) => (
              <ReplaceFileForm
                fileId={fileId}
                labels={labels.replace}
                failure={failure.replace}
                onReplaced={() => {
                  setDone(labels.replace.done);
                  close();
                }}
              />
            )}
          </FormDrawer>
        ) : null}
        {canDeactivate ? (
          <ConfirmDialog
            trigger={labels.deactivate.button}
            triggerLabel={labels.deactivate.buttonLabel}
            isDisabled={deactivate.pending}
            title={labels.deactivate.confirmTitle}
            body={labels.deactivate.confirmBody}
            confirm={labels.deactivate.confirm}
            cancel={labels.deactivate.cancel}
            onConfirm={() => deactivate.submit()}
          />
        ) : null}
      </div>
    </div>
  );
}
