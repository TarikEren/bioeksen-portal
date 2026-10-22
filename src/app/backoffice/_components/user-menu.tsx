"use client";

/**
 * The user menu of the backoffice top bar, with the sign-out (ACC-20 rule 4,
 * `/backoffice/**` row of the stage B1 UI table).
 *
 * It is a HeroUI `Dropdown`: the trigger is a `Button` that shows an avatar with
 * the initials and the name of the user, and the menu holds one action, sign-out,
 * through `useSignOut`. The trigger has the accessible name "Account menu: name",
 * which holds the visible name (WCAG 2.5.3). The avatar is `aria-hidden`. The
 * props hold the name, the initials and the text the control shows, and nothing
 * else about the user (`sds-nextjs-frontend` §2). A failed sign-out shows the
 * localized sentence for its code with the code beside it (DEC-122).
 */
import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import type { Key } from "react";

import { FailureAlert } from "@/app/_components/failure-alert";
import type { FailureLabels } from "@/app/_components/failure";
import { useSignOut } from "@/app/_components/use-sign-out";

const SIGN_OUT_KEY = "sign-out";

interface UserMenuProps {
  /** The name of the signed-in user: the visible text of the trigger. */
  readonly name: string;
  /** The initials in the avatar. */
  readonly initials: string;
  readonly labels: {
    /** The accessible name of the menu. */
    readonly menu: string;
    /** The accessible name of the trigger, already filled with the name. */
    readonly trigger: string;
    readonly signOut: string;
  };
  readonly failure: FailureLabels;
}

export function UserMenu({ name, initials, labels, failure: failureLabels }: UserMenuProps) {
  const { signOut, pending, failure } = useSignOut();

  function onAction(key: Key): void {
    if (key === SIGN_OUT_KEY) {
      signOut();
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-2" aria-busy={pending}>
      <Dropdown>
        <Button variant="ghost" aria-label={labels.trigger} isDisabled={pending} className="max-w-full">
          <Avatar size="sm" color="accent" aria-hidden="true">
            <Avatar.Fallback>{initials}</Avatar.Fallback>
          </Avatar>
          <span className="min-w-0 truncate">{name}</span>
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu aria-label={labels.menu} onAction={onAction}>
            <Dropdown.Item id={SIGN_OUT_KEY} textValue={labels.signOut}>
              <Label>{labels.signOut}</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {failure === null ? null : <FailureAlert failure={failure} labels={failureLabels} />}
    </div>
  );
}
