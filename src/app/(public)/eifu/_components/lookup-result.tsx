"use client";

/**
 * The result step of the lookup page (IFU-70 rule 4, rule 5, IFU-70.AC3, AC4, AC5,
 * IFU-60 rule 4, IFU-62, DEC-019, DEC-073).
 *
 * A `RESOLVED` answer shows the catalog number, the LOT number, the manufacturing
 * date, the document number, the revision label and one download link for each
 * language. It has no success banner and no success color (DEC-019): the
 * document is the answer. Any other outcome has its own title and text, and the
 * outcome code (IFU-70.AC5). The code is the one of the answer and never a copy of
 * a text. The alert of an outcome that needs a review by Bioeksen is `warning`, and
 * the alert of an outcome that says "not found" is `danger`. A state is never
 * shown by color alone: the alert has an icon, a title and the code. The step
 * takes focus on its heading (IFU-70.AC10). The dates go through the formatter of
 * DEC-133 with the active language.
 */
import { Alert, Button } from "@heroui/react";

import { formatBusinessDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/locale-provider";
import { fmt } from "@/lib/i18n/messages";
import type { LookupAnswer, UnresolvedOutcome } from "@/lib/schemas/lookup";

import { FileLinks } from "./file-links";
import type { LookupCopy } from "../_lib/lookup-copy";
import { type SummaryRow, ResultSummary } from "./result-summary";
import { StepHeading } from "./step-heading";

/** The status of the alert of each outcome other than `RESOLVED`. A new outcome fails the type check here. */
const OUTCOME_STATUS: Readonly<Record<UnresolvedOutcome, "danger" | "warning">> = {
  CATALOG_NUMBER_NOT_FOUND: "danger",
  LOT_NOT_FOUND: "danger",
  LOT_CATALOG_MISMATCH: "danger",
  NO_APPLICABLE_VERSION: "danger",
  LOT_DATE_CONFLICT: "warning",
  AMBIGUOUS_APPLICABILITY: "warning",
  NO_FILE_FOR_VERSION: "warning",
  OVERRIDE_TARGET_NOT_PUBLISHED: "warning",
};

interface LookupResultProps {
  readonly copy: Pick<LookupCopy, "result" | "languages" | "outcomes" | "outcomeCode">;
  readonly answer: LookupAnswer;
  readonly onNewLookup: () => void;
}

export function LookupResult({ copy, answer, onNewLookup }: LookupResultProps) {
  const language = useLanguage();
  const identity: SummaryRow[] = [
    { label: copy.result.catalogNumber, value: answer.catalogNumber, identifier: true },
    { label: copy.result.lotNumber, value: answer.lotNumber, identifier: true },
  ];
  if (answer.manufacturingDate !== undefined) {
    identity.push({
      label: copy.result.manufacturingDate,
      value: formatBusinessDate(answer.manufacturingDate, language),
      identifier: true,
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <StepHeading focusOnMount>{copy.result.title}</StepHeading>
      {answer.outcome === "RESOLVED" ? (
        <>
          <ResultSummary
            rows={[
              ...identity,
              { label: copy.result.productName, value: answer.productName, identifier: false },
              { label: copy.result.documentTitle, value: answer.documentTitle, identifier: false },
              { label: copy.result.documentNumber, value: answer.documentNumber, identifier: true },
              { label: copy.result.revision, value: answer.revision, identifier: true },
            ]}
          />
          {answer.resolvedViaOverride ? <p className="text-sm text-muted">{copy.result.overrideNote}</p> : null}
          <FileLinks copy={copy} files={answer.files} />
        </>
      ) : (
        <>
          <Alert status={OUTCOME_STATUS[answer.outcome]}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{copy.outcomes[answer.outcome].title}</Alert.Title>
              <Alert.Description>
                {copy.outcomes[answer.outcome].body}
                <br />
                <span className="whitespace-nowrap">{fmt(copy.outcomeCode, { code: answer.outcome })}</span>
              </Alert.Description>
            </Alert.Content>
          </Alert>
          <ResultSummary rows={identity} />
        </>
      )}
      <div>
        <Button variant="tertiary" onPress={onNewLookup}>
          {copy.result.newLookup}
        </Button>
      </div>
    </section>
  );
}
