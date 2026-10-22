import { describe, expect, it } from "vitest";

import { formatDateTime } from "./date-time";
import { formatFileSize } from "./file-size";

// Source: DEC-133 and DEC-012; FND-08 rule 4.
describe("formatDateTime", () => {
  const instant = new Date("2026-03-09T21:30:00Z");

  it("shows DD.MM.YYYY HH:mm in Turkish, in the time zone Europe/Istanbul", () => {
    expect(formatDateTime(instant, "tr")).toBe("10.03.2026 00:30");
  });

  it("shows D MMM YYYY, HH:mm in English, in the time zone Europe/Istanbul", () => {
    expect(formatDateTime(instant, "en")).toBe("10 Mar 2026, 00:30");
  });

  it("uses the 24-hour clock, with 00 and not 24 after midnight", () => {
    expect(formatDateTime(new Date("2026-09-15T20:59:00Z"), "tr")).toBe("15.09.2026 23:59");
    expect(formatDateTime(new Date("2026-09-15T21:00:00Z"), "tr")).toBe("16.09.2026 00:00");
  });

  it("writes the day without a leading zero in English and with one in Turkish", () => {
    const early = new Date("2026-01-04T10:05:00Z");

    expect(formatDateTime(early, "en")).toBe("4 Jan 2026, 13:05");
    expect(formatDateTime(early, "tr")).toBe("04.01.2026 13:05");
  });

  it("follows the offset of the date: UTC+2 in winter and UTC+3 in summer before 2016", () => {
    expect(formatDateTime(new Date("2015-01-01T00:00:00Z"), "tr")).toBe("01.01.2015 02:00");
    expect(formatDateTime(new Date("2015-07-01T00:00:00Z"), "tr")).toBe("01.07.2015 03:00");
  });

  it("names every month in English with three letters", () => {
    const names = Array.from({ length: 12 }, (_, month) =>
      formatDateTime(new Date(Date.UTC(2026, month, 15, 12, 0)), "en").split(" ")[1],
    );

    expect(names).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });

  it("refuses a date that is not valid", () => {
    expect(() => formatDateTime(new Date("not a date"), "tr")).toThrow(RangeError);
  });
});

describe("formatFileSize", () => {
  it("shows a size under 1000 bytes in bytes", () => {
    expect(formatFileSize(0, "en")).toBe("0 B");
    expect(formatFileSize(999, "en")).toBe("999 B");
  });

  it("steps up at 1000 and keeps at most one decimal", () => {
    expect(formatFileSize(1000, "en")).toBe("1 kB");
    expect(formatFileSize(1500, "en")).toBe("1.5 kB");
    expect(formatFileSize(2_345_678, "en")).toBe("2.3 MB");
    expect(formatFileSize(5_000_000_000, "en")).toBe("5 GB");
  });

  it("does not show 1000 kB: it steps up to 1 MB", () => {
    expect(formatFileSize(999_999, "en")).toBe("1 MB");
  });

  // Source: DEC-133 (the symbols B, kB, MB and GB; at most one decimal); review 2, R-032.
  it("uses the symbols B, kB, MB and GB, with a lowercase k", () => {
    expect([1, 1000, 1_000_000, 1_000_000_000].map((bytes) => formatFileSize(bytes, "en").split(" ")[1])).toEqual([
      "B",
      "kB",
      "MB",
      "GB",
    ]);
  });

  it("never shows more than one decimal", () => {
    for (const bytes of [1234, 12_345, 123_456, 1_234_567, 12_345_678, 1_234_567_890, 987_654_321]) {
      expect(formatFileSize(bytes, "en"), String(bytes)).toMatch(/^\d+(\.\d)? (B|kB|MB|GB)$/);
      expect(formatFileSize(bytes, "tr"), String(bytes)).toMatch(/^\d+(,\d)? (B|kB|MB|GB)$/);
    }
  });

  it("stays in GB for a terabyte or more, because DEC-133 gives no larger symbol", () => {
    expect(formatFileSize(1_500_000_000_000, "en")).toBe("1500 GB");
  });

  it("uses a decimal comma in Turkish", () => {
    expect(formatFileSize(1500, "tr")).toBe("1,5 kB");
  });

  it("refuses a size that is negative, fractional or not finite", () => {
    expect(() => formatFileSize(-1, "en")).toThrow(RangeError);
    expect(() => formatFileSize(1.5, "en")).toThrow(RangeError);
    expect(() => formatFileSize(Number.POSITIVE_INFINITY, "en")).toThrow(RangeError);
  });
});
