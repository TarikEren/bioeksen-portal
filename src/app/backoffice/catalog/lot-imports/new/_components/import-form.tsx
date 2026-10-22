"use client";

/**
 * The form of a LOT import: paste or file, one product or all, the preview, and
 * the commit (CAT-60 rules 1 to 12, DEC-054, DEC-051, mockup `LotImportForm`).
 *
 * Nothing is written until the commit button. The preview is the plan of the
 * server, the same code that writes, so what the person agrees to is what the
 * system does; the commit plans each row again, and its report is what was done.
 * The rows show grouped by product, with the outcome and the reason of each row,
 * and a warning when an earlier import had the same input hash (rule 9). The
 * commit sends the form of the preview, so the commit is the import that the
 * person saw. Any change to a field drops the plan, so a plan never describes
 * input that is no longer in the fields.
 *
 * The import actions take `FormData` with the fields `text` or `file`, and the
 * optional `productId` and `catalogNumber` (DEC-054). The rule of the skill that
 * files do not pass through a server action does not apply: DEC-054 and DEC-051
 * set a body limit of 5 MiB for these two actions, and the server checks the size
 * again. An empty field is left out of the form that is sent, so the server reads
 * an absent field and never an empty file. The form does not re-validate: the
 * server does, and its faults show next to their fields, or in a list when the
 * fault names a column of the input (`lotNumber`) that has no field. The catalog
 * numbers, the LOT numbers and the dates of the rows are in IBM Plex Mono
 * (FND-09.AC3). After a preview, focus goes to the preview. After a commit the
 * person goes to the report of the import.
 */
import { Alert, Button, Description, FieldError, Form, Input, Label, ListBox, Select, TextArea, TextField, Typography } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { commitImportAction, previewImportAction } from "@/app/_actions/catalog";
import { AppLink } from "@/app/_components/app-link";
import { FailureAlert } from "@/app/_components/failure-alert";
import { type FailureLabels, fieldErrorsOf, fieldIssuesOf, hasShownFieldError } from "@/app/_components/failure";
import { failureOf, readText, useActionOutcome, useFormAction } from "@/app/_components/use-action-outcome";
import { fmt, textForCode } from "@/lib/i18n/messages";
import type { ImportPlan, Outcome, Reason, RegulatoryStatus } from "@/lib/schemas/catalog";

import { ImportRowsTable } from "../../../_components/import-rows-table";
import type { Option } from "../../../_lib/options";

/** The names of the fields that the form shows. */
const FIELDS = ["text", "file", "productId", "catalogNumber"] as const;
/** The key of the choice "all products" in the select. */
const ALL_PRODUCTS = "all";

export interface ImportFormLabels {
  readonly text: string;
  readonly textHint: string;
  readonly file: string;
  readonly fileHint: string;
  readonly product: string;
  readonly productPlaceholder: string;
  readonly productHint: string;
  readonly productAny: string;
  readonly catalogNumber: string;
  readonly catalogNumberHint: string;
  readonly preview: string;
  readonly previewing: string;
  readonly commit: string;
  readonly committing: string;
  readonly previewTitle: string;
  /** A template with the placeholder `{count}`. */
  readonly previewIntro: string;
  readonly hashWarning: string;
  readonly hashWarningLink: string;
  readonly hashWarningHint: string;
  /** A template with the placeholders `{status}` and `{count}`. */
  readonly group: string;
  /** A template with the placeholder `{count}`. */
  readonly groupUnknown: string;
  /** A template with the placeholder `{group}`. */
  readonly groupTable: string;
  readonly errorDetails: string;
  readonly fieldLabels: Readonly<Record<string, string>>;
  readonly counts: {
    readonly created: string;
    readonly existing: string;
    readonly conflict: string;
    readonly invalid: string;
  };
  readonly rowColumns: {
    readonly row: string;
    readonly catalogNumber: string;
    readonly lotNumber: string;
    readonly manufacturingDate: string;
    readonly outcome: string;
  };
  readonly outcome: Readonly<Record<Outcome, string>>;
  readonly reason: Readonly<Record<Reason, string>>;
  readonly regulatoryStatus: Readonly<Record<RegulatoryStatus, string>>;
  /** The text of a raw cell that has no value. */
  readonly empty: string;
}

interface ImportFormProps {
  /** The active products, for the choice of one product. */
  readonly products: readonly Option<string>[];
  readonly labels: ImportFormLabels;
  readonly failure: FailureLabels;
}

/** The form that the actions take: only the fields that have a value (DEC-054). */
function importFormOf(source: FormData, products: readonly Option<string>[]): FormData {
  const form = new FormData();
  const text = readText(source, "text");
  if (text.trim() !== "") {
    form.set("text", text);
  }
  const file = source.get("file");
  if (file instanceof File && file.size > 0) {
    form.set("file", file);
  }
  const product = products.find((candidate) => candidate.value === readText(source, "productId"));
  if (product !== undefined) {
    form.set("productId", product.value);
  }
  const catalogNumber = readText(source, "catalogNumber");
  if (catalogNumber.trim() !== "") {
    form.set("catalogNumber", catalogNumber);
  }
  return form;
}

export function ImportForm({ products, labels, failure: failureLabels }: ImportFormProps) {
  const router = useRouter();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [productId, setProductId] = useState<string>(ALL_PRODUCTS);
  /** The form of the last preview, which the commit sends. */
  const previewed = useRef<FormData | null>(null);
  const planRef = useRef<HTMLElement>(null);

  const { formRef, state, submit, pending } = useFormAction(
    async (formData) => {
      const form = importFormOf(formData, products);
      const result = await previewImportAction(form);
      if (result.status === "ok") {
        previewed.current = form;
        setPlan(result.plan);
      } else {
        previewed.current = null;
        setPlan(null);
      }
      return result;
    },
    { focusAfterSuccess: false },
  );
  const commit = useActionOutcome<void>(async () => {
    const form = previewed.current;
    if (form === null) {
      return { status: "fail", code: "VAL-4001", message: "", details: [{ field: "text", issue: "is required when the form has no file" }] };
    }
    const result = await commitImportAction(form);
    if (result.status === "ok") {
      router.push(`/backoffice/catalog/lot-imports/${result.import.id}`);
    }
    return result;
  });

  const failure = failureOf(state.outcome);
  const fields = fieldErrorsOf(failure, failureLabels);
  const leftover = fieldIssuesOf(failure).filter((entry) => !FIELDS.some((name) => name === entry.field));
  const commitFailure = failureOf(commit.state.outcome);
  const busy = pending || commit.pending;
  const hasPlan = plan !== null;

  // A new plan is the next thing the person reads, so focus goes to it.
  useEffect(() => {
    if (hasPlan) {
      planRef.current?.focus();
    }
  }, [hasPlan, state.successes]);

  const dropPlan = (): void => {
    setPlan(null);
    previewed.current = null;
  };

  return (
    <div className="flex flex-col gap-6">
      <Form
        ref={formRef}
        validationBehavior="aria"
        validationErrors={fields}
        className="flex max-w-3xl flex-col gap-4"
        aria-busy={busy}
        onSubmit={(event) => {
          // Not `<form action>`: React 19 resets the fields before the action
          // runs, and a rejected submit would wipe what the person typed.
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        {failure !== null && (leftover.length > 0 || !hasShownFieldError(fields, FIELDS)) ? (
          <div className="flex flex-col gap-2">
            <FailureAlert failure={failure} labels={failureLabels} />
            {leftover.length === 0 ? null : (
              <ul aria-label={labels.errorDetails} className="list-disc pl-6 text-sm">
                {leftover.map((entry) => (
                  <li key={`${entry.field}:${entry.issue}`}>
                    {textForCode(labels.fieldLabels, entry.field, entry.field)}:{" "}
                    {textForCode(failureLabels.fieldIssues, entry.issue, failureLabels.fieldInvalid)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <TextField name="text" onChange={dropPlan}>
          <Label>{labels.text}</Label>
          <TextArea rows={8} spellCheck={false} className="font-mono" />
          <Description>{labels.textHint}</Description>
          <FieldError />
        </TextField>
        <TextField name="file" type="file" onChange={dropPlan}>
          <Label>{labels.file}</Label>
          <Input accept=".xlsx,.csv,.tsv,.txt" />
          <Description>{labels.fileHint}</Description>
          <FieldError />
        </TextField>
        <Select
          name="productId"
          value={productId}
          placeholder={labels.productPlaceholder}
          onChange={(value) => {
            setProductId(products.find((candidate) => candidate.value === value)?.value ?? ALL_PRODUCTS);
            dropPlan();
          }}
        >
          <Label>{labels.product}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id={ALL_PRODUCTS} textValue={labels.productAny}>
                {labels.productAny}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {products.map((product) => (
                <ListBox.Item key={product.value} id={product.value} textValue={product.label}>
                  <span className="font-mono">{product.label}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
          <Description>{labels.productHint}</Description>
          <FieldError />
        </Select>
        <TextField name="catalogNumber" autoComplete="off" onChange={dropPlan}>
          <Label>{labels.catalogNumber}</Label>
          <Input className="font-mono" />
          <Description>{labels.catalogNumberHint}</Description>
          <FieldError />
        </TextField>
        <div>
          <Button type="submit" variant="primary" isDisabled={busy}>
            {pending ? labels.previewing : labels.preview}
          </Button>
        </div>
      </Form>

      {plan === null ? null : (
        <section
          ref={planRef}
          tabIndex={-1}
          aria-labelledby="import-preview-title"
          className="flex flex-col gap-4 outline-none"
        >
          <Typography.Heading level={2} weight="semibold" id="import-preview-title">
            {labels.previewTitle}
          </Typography.Heading>
          <Typography.Paragraph color="muted" size="sm">
            {fmt(labels.previewIntro, { count: plan.rowCount })}
          </Typography.Paragraph>
          {plan.sameHashImportId === null ? null : (
            <Alert status="warning" role="status">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{labels.hashWarning}</Alert.Title>
                <Alert.Description>
                  {labels.hashWarningHint}{" "}
                  <AppLink href={`/backoffice/catalog/lot-imports/${plan.sameHashImportId}`}>{labels.hashWarningLink}</AppLink>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {(
              [
                ["created", labels.counts.created, plan.counts.created],
                ["existing", labels.counts.existing, plan.counts.existing],
                ["conflict", labels.counts.conflict, plan.counts.conflict],
                ["invalid", labels.counts.invalid, plan.counts.invalid],
              ] as const
            ).map(([key, label, value]) => (
              <div key={key} className="flex gap-2">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {plan.groups.map((group) => {
            const code =
              group.internalCode === null || group.regulatoryStatus === null
                ? null
                : { stem: group.internalCode, status: labels.regulatoryStatus[group.regulatoryStatus] };
            const heading =
              code === null
                ? fmt(labels.groupUnknown, { count: group.rows.length })
                : fmt(labels.group, { status: code.status, count: group.rows.length });
            const tableName = fmt(labels.groupTable, { group: code === null ? heading : `${code.stem} ${heading}` });
            return (
              <div key={group.productId ?? "none"} className="flex flex-col gap-2">
                <Typography.Heading level={3} weight="semibold">
                  {code === null ? null : <span className="font-mono">{code.stem} </span>}
                  {heading}
                </Typography.Heading>
                <ImportRowsTable
                  ariaLabel={tableName}
                  rows={group.rows}
                  labels={{ columns: labels.rowColumns, outcome: labels.outcome, reason: labels.reason, empty: labels.empty }}
                />
              </div>
            );
          })}

          {commitFailure === null ? null : <FailureAlert failure={commitFailure} labels={failureLabels} />}
          <div>
            <Button variant="primary" isDisabled={busy} onPress={() => commit.submit()}>
              {commit.pending ? labels.committing : labels.commit}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
