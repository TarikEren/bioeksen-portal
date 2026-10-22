/**
 * The pure rules of the applicability periods (IFU-30, DEC-061, DEC-012).
 *
 * A period is half-open: `effectiveFrom` is inside it and `effectiveTo` is not
 * (DEC-061). A business date is the text `YYYY-MM-DD`. Such texts compare in the
 * order of the dates, so this file never builds a `Date` from one, and no time
 * zone can move a day.
 *
 * This file is pure.
 */
import { EIFU_ISSUES } from "@/lib/schemas/eifu";

/** The time zone of the business day (DEC-012). */
const BUSINESS_TIME_ZONE = "Europe/Istanbul";

const BUSINESS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The business date of an instant, in the time zone of DEC-012. */
export function businessDateOf(instant: Date): string {
  const parts = Object.fromEntries(BUSINESS_DAY.formatToParts(instant).map((part) => [part.type, part.value]));
  return `${String(parts["year"])}-${String(parts["month"])}-${String(parts["day"])}`;
}

/** The part of a period that the rules read. */
export interface PeriodDates {
  readonly id: string;
  readonly effectiveFrom: string;
  /** `null` for an open period. */
  readonly effectiveTo: string | null;
}

/** Whether the period holds the date (DEC-061: `effectiveFrom` is inside, `effectiveTo` is not). */
export function periodContains(period: Pick<PeriodDates, "effectiveFrom" | "effectiveTo">, date: string): boolean {
  return period.effectiveFrom <= date && (period.effectiveTo === null || date < period.effectiveTo);
}

/** The result of the order checks of a publication (IFU-30 rule 3, step 4). */
export type PublicationPlan =
  | {
      readonly kind: "ok";
      /** The live open period that the publication closes, or `null`. */
      readonly closes: PeriodDates | null;
    }
  | {
      readonly kind: "refused";
      /** The phrase of the `details` entry on `effectiveFrom`. The code is 400 `VAL-4006`. */
      readonly issue: typeof EIFU_ISSUES.effectiveFromNotAfterOpenPeriod | typeof EIFU_ISSUES.effectiveFromBeforeLatestEnd;
    };

/**
 * Plans the new period of a product from its live periods (IFU-30 rule 3, step
 * 4). A live period is one that no withdrawal marked.
 *
 * - With an open period, an `effectiveFrom` on or before the start of the open
 *   period is refused (AC3). A later one closes the open period at the new start.
 * - Without an open period, an `effectiveFrom` before the latest end is refused
 *   (AC8). The latest end itself is allowed.
 */
export function planPublication(livePeriods: readonly PeriodDates[], effectiveFrom: string): PublicationPlan {
  const open = livePeriods.find((period) => period.effectiveTo === null) ?? null;
  if (open !== null) {
    if (effectiveFrom <= open.effectiveFrom) {
      return { kind: "refused", issue: EIFU_ISSUES.effectiveFromNotAfterOpenPeriod };
    }
    return { kind: "ok", closes: open };
  }
  const latestEnd = livePeriods.reduce<string | null>(
    (latest, period) => (period.effectiveTo !== null && (latest === null || period.effectiveTo > latest) ? period.effectiveTo : latest),
    null,
  );
  if (latestEnd !== null && effectiveFrom < latestEnd) {
    return { kind: "refused", issue: EIFU_ISSUES.effectiveFromBeforeLatestEnd };
  }
  return { kind: "ok", closes: null };
}
