"use client";

/**
 * The roles of a user, with grant and revoke (ACC-31.AC1 to AC5).
 *
 * Every viewer sees the list of active roles. A holder of `iam.role.manage` also
 * sees the revoke button for each role (`canRevoke`) and the grant control
 * (`grantable`, which the server gives only for another active user). Hiding a
 * control is not authorization: the service checks `iam.role.manage` again and
 * refuses a grant to the own account (`PERM-4150`). The server passes the role
 * names in the active language, and the date as finished text. The revoke button
 * names the role in its accessible name (`sds-nextjs-frontend` §5). A result is
 * announced: a failure with `role="alert"`, and a success in a status region that
 * is always rendered. A failure shows the localized sentence for its code with
 * the code beside it (DEC-122). After a revoke the row is gone, so focus moves to
 * the list. The grant select is controlled, so the button stays disabled until a
 * role is chosen; that is display state, not validation.
 */
import { Alert, Button, Form, Label, ListBox, Select, Typography } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { grantRoleAction, revokeRoleAction } from "@/app/_actions/identity";
import { FailureAlert } from "@/app/_components/failure-alert";
import type { FailureLabels } from "@/app/_components/failure";
import { failureOf, useActionOutcome } from "@/app/_components/use-action-outcome";
import { fmt } from "@/lib/i18n/messages";
import type { RoleCode } from "@/lib/schemas/identity";

export interface RoleRow {
  readonly id: string;
  readonly code: RoleCode;
  /** The name in the active language. */
  readonly name: string;
  /** The date of the grant, already formatted. */
  readonly grantedAt: string;
}

export interface GrantableRole {
  readonly code: RoleCode;
  /** The name in the active language. */
  readonly name: string;
}

interface RoleManagerProps {
  readonly userId: string;
  readonly roles: readonly RoleRow[];
  readonly canRevoke: boolean;
  /** The roles that the user may be given. `null` hides the grant control. */
  readonly grantable: readonly GrantableRole[] | null;
  readonly labels: {
    readonly list: string;
    readonly none: string;
    readonly revoke: string;
    /** A template with the placeholder `{role}`. */
    readonly revokeLabel: string;
    readonly revokeDone: string;
    readonly grantLabel: string;
    readonly grantPlaceholder: string;
    readonly grantSubmit: string;
    readonly grantNothing: string;
    readonly grantDone: string;
    readonly grantedAt: string;
  };
  readonly failure: FailureLabels;
}

export function RoleManager({ userId, roles, canRevoke, grantable, labels, failure: failureLabels }: RoleManagerProps) {
  const [selected, setSelected] = useState<RoleCode | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const revoke = useActionOutcome<RoleCode>((roleCode) => revokeRoleAction(userId, roleCode));
  const grant = useActionOutcome<RoleCode>(async (roleCode) => {
    const result = await grantRoleAction(userId, { roleCode });
    if (result.status === "ok") {
      setSelected(null);
    }
    return result;
  });
  const revokeFailure = failureOf(revoke.state.outcome);
  const grantFailure = failureOf(grant.state.outcome);
  const pending = revoke.pending || grant.pending;
  const revokeSuccesses = revoke.state.successes;

  // The revoked row is gone, so focus would drop to the page. Put it on the list.
  useEffect(() => {
    if (revokeSuccesses > 0) {
      listRef.current?.focus();
    }
  }, [revokeSuccesses]);

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {revokeFailure === null ? null : <FailureAlert failure={revokeFailure} labels={failureLabels} />}
      {/* A success waits its turn. The status region is always rendered. */}
      <div role="status" className="flex flex-col gap-4">
        {revoke.state.outcome.status === "ok" ? (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{labels.revokeDone}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}
        {grant.state.outcome.status === "ok" ? (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{labels.grantDone}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}
      </div>

      <div ref={listRef} tabIndex={-1} className="outline-none">
        {roles.length === 0 ? (
          <Typography.Paragraph color="muted" size="sm">
            {labels.none}
          </Typography.Paragraph>
        ) : (
          <ul aria-label={labels.list} className="flex flex-col gap-3">
            {roles.map((role) => (
              <li key={role.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <Typography.Paragraph weight="medium">{role.name}</Typography.Paragraph>
                  <Typography.Paragraph color="muted" size="sm" className="tabular-nums">
                    {fmt(labels.grantedAt, { date: role.grantedAt })}
                  </Typography.Paragraph>
                </div>
                {canRevoke ? (
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={pending}
                    aria-label={fmt(labels.revokeLabel, { role: role.name })}
                    onPress={() => revoke.submit(role.code)}
                  >
                    {labels.revoke}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {grantable === null ? null : grantable.length === 0 ? (
        <Typography.Paragraph color="muted" size="sm">
          {labels.grantNothing}
        </Typography.Paragraph>
      ) : (
        <Form
          validationBehavior="aria"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (selected !== null) {
              grant.submit(selected);
            }
          }}
        >
          {grantFailure === null ? null : <FailureAlert failure={grantFailure} labels={failureLabels} />}
          <Select
            className="max-w-xs"
            placeholder={labels.grantPlaceholder}
            value={selected}
            onChange={(value) => setSelected(grantable.find((role) => role.code === value)?.code ?? null)}
          >
            <Label>{labels.grantLabel}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {grantable.map((role) => (
                  <ListBox.Item key={role.code} id={role.code} textValue={role.name}>
                    {role.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <div>
            <Button type="submit" variant="primary" isDisabled={pending || selected === null}>
              {labels.grantSubmit}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}
