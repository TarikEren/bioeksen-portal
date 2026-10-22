/**
 * The formatter of timestamps (FND-08 rule 4, DEC-012).
 *
 * The interface shows a timestamp in the time zone `Europe/Istanbul`. The
 * timestamp `2026-03-09T21:30:00Z` shows as the date 10 March 2026 and the time
 * 00:30 (FND-08.AC6).
 *
 * Skeleton of stage B0: the body throws `NotImplemented`.
 */
import { NotImplemented } from "@/lib/errors";

export function formatDateTime(instant: Date, locale: "tr" | "en"): string {
  void instant;
  void locale;
  throw new NotImplemented("formatDateTime");
}
