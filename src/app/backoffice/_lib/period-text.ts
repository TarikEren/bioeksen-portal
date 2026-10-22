/**
 * The text of an applicability period (IFU-30, DEC-061, DEC-133).
 *
 * A period is half-open: its end date is outside it. The text shows the two
 * dates in the form of DEC-133 and says "open-ended" for a period with no end. A
 * version that was never published has no period. This file is pure.
 */
import { formatBusinessDate } from "@/lib/format";
import type { Language } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { PeriodView } from "@/lib/schemas/eifu";

export interface PeriodTexts {
  readonly closed: string;
  readonly open: string;
  readonly none: string;
}

/** The text of a period, or the text for a version that has none. */
export function periodText(
  period: Pick<PeriodView, "effectiveFrom" | "effectiveTo"> | null,
  texts: PeriodTexts,
  language: Language,
): string {
  if (period === null) {
    return texts.none;
  }
  const from = formatBusinessDate(period.effectiveFrom, language);
  return period.effectiveTo === null
    ? fmt(texts.open, { from })
    : fmt(texts.closed, { from, to: formatBusinessDate(period.effectiveTo, language) });
}
