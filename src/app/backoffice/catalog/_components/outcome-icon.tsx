/**
 * The icon of an import outcome, of an import status and of a date conflict
 * (DEC-019, CAT-60 rule 6,
 * `sds-nextjs-frontend` §5 Icons).
 *
 * Inline SVG with `currentColor`, so the token of the chip around it decides the
 * color. It is `aria-hidden`: the text beside it names the outcome, so an
 * outcome is never shown by color or by icon alone. Four shapes:
 * a check for a new LOT, an equals sign for a LOT that is registered already, a
 * triangle with a mark for a row that needs a person (a conflict), and a cross for
 * an invalid row. A clock shows an import that is still processing.
 */
export type OutcomeIconKind = "created" | "existing" | "conflict" | "invalid" | "processing";

interface OutcomeIconProps {
  readonly kind: OutcomeIconKind;
}

const STROKE = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Shape({ kind }: OutcomeIconProps) {
  switch (kind) {
    case "created":
      return <path d="m5 12.5 4.5 4.5L19 7.5" {...STROKE} />;
    case "existing":
      return <path d="M6 9h12M6 15h12" {...STROKE} />;
    case "conflict":
      return (
        <>
          <path d="M12 4 21 20H3L12 4Z" {...STROKE} />
          <path d="M12 10v4M12 17v.5" {...STROKE} />
        </>
      );
    case "invalid":
      return <path d="m7 7 10 10M17 7 7 17" {...STROKE} />;
    case "processing":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" {...STROKE} />
          <path d="M12 7.5V12l3 2" {...STROKE} />
        </>
      );
  }
}

export function OutcomeIcon({ kind }: OutcomeIconProps) {
  return (
    <svg aria-hidden="true" fill="none" width="14" height="14" viewBox="0 0 24 24">
      <Shape kind={kind} />
    </svg>
  );
}
