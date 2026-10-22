"use client";

/**
 * A button that opens a drawer with a form (`sds-nextjs-frontend` §5).
 *
 * It is a composition of HeroUI's `Drawer` parts, as the mockup of the catalog
 * opens a drawer for each change (`Drawer`, `DateCorrectionDrawer`). The trigger
 * button has an accessible name, and the name holds the record when the button
 * repeats in a table row. The drawer content is unmounted when it closes, so a
 * form that opens again starts with its first values. The children are a function
 * of `close`, so a form closes the drawer after a success.
 */
import { Button, Drawer } from "@heroui/react";
import type { ReactNode } from "react";

interface FormDrawerProps {
  /** The text of the trigger button. */
  readonly trigger: string;
  /** The accessible name of the trigger button, when the text alone does not name the record. */
  readonly triggerLabel?: string;
  readonly variant?: "primary" | "secondary" | "outline";
  readonly title: string;
  readonly children: (close: () => void) => ReactNode;
}

export function FormDrawer({ trigger, triggerLabel, variant = "secondary", title, children }: FormDrawerProps) {
  return (
    <Drawer>
      <Button size="sm" variant={variant} aria-label={triggerLabel}>
        {trigger}
      </Button>
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            {({ close }) => (
              <>
                <Drawer.CloseTrigger />
                <Drawer.Header>
                  <Drawer.Heading>{title}</Drawer.Heading>
                </Drawer.Header>
                <Drawer.Body>{children(close)}</Drawer.Body>
              </>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
