/**
 * The formatter of timestamps (FND-08 rule 4, DEC-012, DEC-133).
 *
 * The interface shows a timestamp in the time zone `Europe/Istanbul`, on the
 * 24-hour clock: `DD.MM.YYYY HH:mm` in Turkish and `D MMM YYYY, HH:mm` in
 * English. The timestamp `2026-03-09T21:30:00Z` shows as `10.03.2026 00:30` and
 * `10 Mar 2026, 00:30` (FND-08.AC6).
 *
 * The digits come from `Intl.DateTimeFormat` for the time zone, and the form is
 * built here, so the output does not change with the version of the ICU data
 * (an `en-GB` short month, for one, changes between versions).
 */

export const INTERFACE_TIME_ZONE = "Europe/Istanbul";

export const ENGLISH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: INTERFACE_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

interface Fields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

function fieldsOf(instant: Date): Fields {
  const found = new Map<string, number>();
  for (const part of parts.formatToParts(instant)) {
    if (part.type !== "literal") {
      found.set(part.type, Number(part.value));
    }
  }
  const read = (type: string): number => {
    const value = found.get(type);
    if (value === undefined || Number.isNaN(value)) {
      throw new RangeError(`The date has no ${type}`);
    }
    return value;
  };
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/**
 * Formats a timestamp for the interface.
 *
 * @throws RangeError when `instant` is not a valid date.
 */
export function formatDateTime(instant: Date, locale: "tr" | "en"): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("The timestamp is not a valid date");
  }
  const { year, month, day, hour, minute } = fieldsOf(instant);
  const time = `${twoDigits(hour)}:${twoDigits(minute)}`;
  switch (locale) {
    case "tr":
      return `${twoDigits(day)}.${twoDigits(month)}.${String(year)} ${time}`;
    case "en":
      return `${String(day)} ${ENGLISH_MONTHS[month - 1] ?? ""} ${String(year)}, ${time}`;
  }
}
