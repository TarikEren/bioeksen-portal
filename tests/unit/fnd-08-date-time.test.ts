/**
 * FND-08 Languages and formats: AC6, the forms of DEC-133 in the time zone of
 * DEC-012 (`Europe/Istanbul`).
 */
import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/format/date-time";

const INSTANT = new Date("2026-03-09T21:30:00Z");

describe("FND-08 date and time format", () => {
  /** The instant 2026-03-09T21:30:00Z shows as 10.03.2026 00:30 in Turkish. */
  it("FND-08.AC6: in Turkish, 2026-03-09T21:30:00Z shows as 10.03.2026 00:30", () => {
    expect(formatDateTime(INSTANT, "tr")).toBe("10.03.2026 00:30");
  });

  /** The instant 2026-03-09T21:30:00Z shows as 10 Mar 2026, 00:30 in English. */
  it("FND-08.AC6: in English, 2026-03-09T21:30:00Z shows as 10 Mar 2026, 00:30", () => {
    expect(formatDateTime(INSTANT, "en")).toBe("10 Mar 2026, 00:30");
  });
});
