"use client";

/**
 * A button that asks for a confirmation before a deactivation (CAT-10.AC5,
 * CAT-20.AC5).
 *
 * A composition of HeroUI's `AlertDialog`, the same dialog that the user page
 * uses for the deactivation of an account. A deactivation hides the record from
 * the choice lists and cannot be undone in this release, so the person confirms
 * it. The trigger has an accessible name that holds the record when the button
 * repeats in a table row. The component calls `onConfirm` and holds no state.
 */
import { AlertDialog, Button } from "@heroui/react";

interface ConfirmDialogProps {
  readonly trigger: string;
  /** The accessible name of the trigger button, when the text alone does not name the record. */
  readonly triggerLabel?: string;
  readonly isDisabled: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly onConfirm: () => void;
}

export function ConfirmDialog({
  trigger,
  triggerLabel,
  isDisabled,
  title,
  body,
  confirm,
  cancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <Button size="sm" variant="danger-soft" isDisabled={isDisabled} aria-label={triggerLabel}>
        {trigger}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            {({ close }) => (
              <>
                <AlertDialog.Header>
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>{title}</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <p>{body}</p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button variant="tertiary" onPress={close}>
                    {cancel}
                  </Button>
                  <Button
                    variant="danger"
                    onPress={() => {
                      close();
                      onConfirm();
                    }}
                  >
                    {confirm}
                  </Button>
                </AlertDialog.Footer>
              </>
            )}
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
