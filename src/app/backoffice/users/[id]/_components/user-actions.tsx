"use client";

/**
 * The account actions of a user: send the invitation again and deactivate
 * (ACC-10.AC6, AC7, AC8).
 *
 * The server decides which action to offer (`canReinvite`, `canDeactivate`) from
 * the state of the user and the permission `organization.users.manage`. Hiding a
 * button is not authorization: the service checks the permission and refuses to
 * deactivate the own account (`PERM-4150`) again. A deactivation ends each
 * session of the user and cannot be undone in this release, so it asks for a
 * confirmation in HeroUI's `AlertDialog`. A result is announced: a failure with
 * `role="alert"`, and a success in a status region that is always rendered. A
 * failure shows the localized sentence for its code with the code beside it
 * (DEC-122).
 */
import { Alert, AlertDialog, Button, Typography } from "@heroui/react";

import { deactivateUserAction, reinviteUserAction } from "@/app/_actions/identity";
import { FailureAlert } from "@/app/_components/failure-alert";
import type { FailureLabels } from "@/app/_components/failure";
import { failureOf, useActionOutcome } from "@/app/_components/use-action-outcome";

interface UserActionsProps {
  readonly userId: string;
  readonly canReinvite: boolean;
  readonly canDeactivate: boolean;
  /** The text shown when no action is on offer, or `null` to show none. A done message stays above it. */
  readonly emptyText: string | null;
  readonly labels: {
    readonly reinvite: string;
    readonly reinviteDone: string;
    readonly deactivate: string;
    readonly confirmTitle: string;
    readonly confirmBody: string;
    readonly confirm: string;
    readonly cancel: string;
    readonly deactivateDone: string;
  };
  readonly failure: FailureLabels;
}

export function UserActions({
  userId,
  canReinvite,
  canDeactivate,
  emptyText,
  labels,
  failure: failureLabels,
}: UserActionsProps) {
  const reinvite = useActionOutcome<void>(() => reinviteUserAction(userId));
  const deactivate = useActionOutcome<void>(() => deactivateUserAction(userId));
  const reinviteFailure = failureOf(reinvite.state.outcome);
  const deactivateFailure = failureOf(deactivate.state.outcome);
  const pending = reinvite.pending || deactivate.pending;

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {reinviteFailure === null ? null : <FailureAlert failure={reinviteFailure} labels={failureLabels} />}
      {deactivateFailure === null ? null : <FailureAlert failure={deactivateFailure} labels={failureLabels} />}
      {/* A success waits its turn. The status region is always rendered. */}
      <div role="status" className="flex flex-col gap-4">
        {reinvite.state.outcome.status === "ok" ? (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{labels.reinviteDone}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}
        {deactivate.state.outcome.status === "ok" ? (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{labels.deactivateDone}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}
      </div>
      {!canReinvite && !canDeactivate && emptyText !== null ? (
        <Typography.Paragraph color="muted" size="sm">
          {emptyText}
        </Typography.Paragraph>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {canReinvite ? (
          <Button variant="secondary" isDisabled={pending} onPress={() => reinvite.submit()}>
            {labels.reinvite}
          </Button>
        ) : null}
        {canDeactivate ? (
          <AlertDialog>
            <Button variant="danger-soft" isDisabled={pending}>
              {labels.deactivate}
            </Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog className="sm:max-w-[420px]">
                  {({ close }) => (
                    <>
                      <AlertDialog.Header>
                        <AlertDialog.Icon status="danger" />
                        <AlertDialog.Heading>{labels.confirmTitle}</AlertDialog.Heading>
                      </AlertDialog.Header>
                      <AlertDialog.Body>
                        <p>{labels.confirmBody}</p>
                      </AlertDialog.Body>
                      <AlertDialog.Footer>
                        <Button variant="tertiary" onPress={close}>
                          {labels.cancel}
                        </Button>
                        <Button
                          variant="danger"
                          onPress={() => {
                            close();
                            deactivate.submit();
                          }}
                        >
                          {labels.confirm}
                        </Button>
                      </AlertDialog.Footer>
                    </>
                  )}
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
}
