"use client";

/**
 * The single-LOT form of the product page (CAT-40, CAT-50, DEC-050, mockup
 * `LotPanel`).
 *
 * A holder of `catalog.lot.manage` picks a catalog number, enters the LOT
 * number, and may enter a supplied manufacturing date and an expiry date. The
 * LOT number goes to the server as it is typed: the server cleans it once and
 * reads its date, so the form never reads the LOT number (CAT-30 rule 3). The
 * kit-code check follows DEC-050: when the server refuses the LOT with the phrase
 * for a kit-code mismatch on `lotNumber` (CAT-40.AC7), the form shows the
 * confirmation, and the next submit carries `confirmKitCodeMismatch` (CAT-40.AC8).
 * The expected kit code comes from the server, as data (DEC-048). A LOT with a
 * date conflict is said once when it is created, in the status region that is
 * always rendered (DEC-046). The form does not re-validate: the server does. A
 * form with no catalog number makes the failure `VAL-4001` for that field here,
 * because the action needs an id. After a success the fields reset by a new `key`
 * and focus goes to the first field. The LOT number and the dates are in IBM
 * Plex Mono (FND-09.AC3).
 */
import { Alert, Button, Checkbox, Description, FieldError, Form, Input, Label, ListBox, Select, TextField, Typography } from "@heroui/react";
import { useState } from "react";

import { registerLotAction } from "@/app/_actions/catalog";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, fieldIssuesOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useFormAction } from "@/app/_components/use-action-outcome";
import type { RegisterLotInput } from "@/lib/schemas/catalog";

import { DateInput } from "../../../_components/date-input";
import { DoneNotice } from "../../../_components/done-notice";

/**
 * The fixed phrase that the service puts in `details` for a kit-code mismatch
 * (CAT-40.AC7). It is a contract phrase, as the keys of `common.fieldIssues` are.
 */
const KIT_CODE_MISMATCH_ISSUE = "does not match the kit code of the catalog number";

export interface LotCatalogNumber {
  readonly id: string;
  readonly catalogNumber: string;
  /** The expected kit code, or `null` when the check does not apply (DEC-049). */
  readonly expectedKitCode: string | null;
}

interface RegisterLotFormProps {
  readonly catalogNumbers: readonly LotCatalogNumber[];
  readonly labels: {
    readonly title: string;
    readonly noCatalogNumber: string;
    readonly catalogNumber: string;
    readonly catalogNumberPlaceholder: string;
    readonly lotNumber: string;
    readonly lotNumberHint: string;
    readonly suppliedDate: string;
    readonly suppliedDateHint: string;
    readonly expiryDate: string;
    readonly expiryDateHint: string;
    readonly expectedKitCode: string;
    readonly noKitCheck: string;
    readonly mismatchTitle: string;
    readonly mismatchBody: string;
    readonly mismatchConfirm: string;
    readonly submit: string;
    readonly saving: string;
    readonly done: string;
    readonly doneConflict: string;
  };
  readonly failure: FailureLabels;
}

const FIELDS = ["catalogNumberId", "lotNumber", "suppliedManufacturingDate", "expiryDate"] as const;

export function RegisterLotForm({ catalogNumbers, labels, failure: failureLabels }: RegisterLotFormProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const target = catalogNumbers.find((candidate) => candidate.id === readText(formData, "catalogNumberId"));
      if (target === undefined) {
        // The action needs an id. The fixed phrase is the one of the server.
        return { status: "fail", code: "VAL-4001", message: "", details: [{ field: "catalogNumberId", issue: "is required" }] };
      }
      const suppliedManufacturingDate = readText(formData, "suppliedManufacturingDate");
      const expiryDate = readText(formData, "expiryDate");
      const input: RegisterLotInput = {
        lotNumber: readText(formData, "lotNumber"),
        ...(suppliedManufacturingDate === "" ? {} : { suppliedManufacturingDate }),
        ...(expiryDate === "" ? {} : { expiryDate }),
        ...(needsConfirmation && confirmed ? { confirmKitCodeMismatch: true } : {}),
      };
      const result = await registerLotAction(target.id, input);
      if (result.status === "ok") {
        setDone(result.lot.hasDateConflict ? labels.doneConflict : labels.done);
        setSelectedId(null);
        setNeedsConfirmation(false);
        setConfirmed(false);
      } else {
        setDone(null);
        if (fieldIssuesOf({ status: "fail", code: result.code, details: result.details }).some(
          (entry) => entry.field === "lotNumber" && entry.issue === KIT_CODE_MISMATCH_ISSUE,
        )) {
          setNeedsConfirmation(true);
        }
      }
      return result;
    },
    { focusAfterSuccess: true },
  );
  const failure = failureOf(state.outcome);
  const fields = fieldErrorsOf(failure, failureLabels);
  const selected = catalogNumbers.find((candidate) => candidate.id === selectedId) ?? null;

  if (catalogNumbers.length === 0) {
    return (
      <Typography.Paragraph color="muted" size="sm">
        {labels.noCatalogNumber}
      </Typography.Paragraph>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Form
        key={state.successes}
        ref={formRef}
        validationBehavior="aria"
        validationErrors={fields}
        className="flex max-w-xl flex-col gap-4"
        aria-busy={pending}
        onSubmit={(event) => {
          // Not `<form action>`: React 19 resets the fields before the action
          // runs, and a rejected submit would wipe what the person typed.
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        {failure !== null && !hasShownFieldError(fields, FIELDS) ? (
          <FailureAlert failure={failure} labels={failureLabels} />
        ) : null}
        <Select
          isRequired
          name="catalogNumberId"
          placeholder={labels.catalogNumberPlaceholder}
          value={selectedId}
          onChange={(value) => setSelectedId(catalogNumbers.find((candidate) => candidate.id === value)?.id ?? null)}
        >
          <Label>{labels.catalogNumber}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {catalogNumbers.map((candidate) => (
                <ListBox.Item key={candidate.id} id={candidate.id} textValue={candidate.catalogNumber}>
                  <span className="font-mono">{candidate.catalogNumber}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
          {selected === null ? null : (
            <Description>
              {selected.expectedKitCode === null ? (
                labels.noKitCheck
              ) : (
                <>
                  {labels.expectedKitCode}: <span className="font-mono">{selected.expectedKitCode}</span>
                </>
              )}
            </Description>
          )}
          <FieldError />
        </Select>
        <TextField isRequired name="lotNumber" autoComplete="off">
          <Label>{labels.lotNumber}</Label>
          <Input className="font-mono" />
          <Description>{labels.lotNumberHint}</Description>
          <FieldError />
        </TextField>
        <DateInput name="suppliedManufacturingDate" label={labels.suppliedDate} hint={labels.suppliedDateHint} />
        <DateInput name="expiryDate" label={labels.expiryDate} hint={labels.expiryDateHint} />
        {needsConfirmation ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{labels.mismatchTitle}</Alert.Title>
              <Alert.Description>{labels.mismatchBody}</Alert.Description>
              <Checkbox isSelected={confirmed} onChange={setConfirmed}>
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  {labels.mismatchConfirm}
                </Checkbox.Content>
              </Checkbox>
            </Alert.Content>
          </Alert>
        ) : null}
        <div>
          <Button type="submit" variant="primary" isDisabled={pending}>
            {pending ? labels.saving : labels.submit}
          </Button>
        </div>
      </Form>
      <DoneNotice message={done} />
    </div>
  );
}
