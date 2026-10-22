import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";

import { LOG_RETENTION_DAYS, parseLogQuery } from "./log-query";

const now = new Date("2026-10-22T10:00:00.000Z");

function query(search: string) {
  return parseLogQuery(new URLSearchParams(search), now);
}

function failureOf(search: string): AppError {
  try {
    query(search);
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
  }
  throw new Error("the query was accepted");
}

// Source: sds-api-design/references/standard-api-endpoints.md (GET /api/admin/logs)
// and code-prefixes.md (steps 15 to 19).
describe("parseLogQuery", () => {
  it("resolves the defaults: page 1, limit 50, the window to now", () => {
    const resolved = query("");

    expect(resolved).toMatchObject({ page: 1, limit: 50, severity: null, type: null, softwareId: null, code: null });
    expect(resolved.endDate.toISOString()).toBe("2026-10-22T10:00:00.000Z");
    expect(resolved.startDate.toISOString()).toBe(
      new Date(now.getTime() - LOG_RETENTION_DAYS * 86_400_000).toISOString(),
    );
  });

  it("reads every filter", () => {
    const resolved = query(
      "severity=ERROR&type=SECURITY&code=AUTH-4101&id=bioeksen-portal&page=2&limit=10&startDate=2026-10-21T00:00:00Z&endDate=2026-10-22T00:00:00%2B03:00",
    );

    expect(resolved).toMatchObject({
      severity: "ERROR",
      type: "SECURITY",
      code: "AUTH-4101",
      softwareId: "bioeksen-portal",
      page: 2,
      limit: 10,
    });
    expect(resolved.endDate.toISOString()).toBe("2026-10-21T21:00:00.000Z");
  });

  it("clamps a startDate before the window to the start of it", () => {
    const resolved = query("startDate=2020-01-01T00:00:00Z");

    expect(resolved.startDate.toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });

  it("ignores a parameter that it does not know", () => {
    expect(query("utm_source=mail&page=3").page).toBe(3);
  });

  it("gives VAL-4002 for a value outside an enumeration", () => {
    expect(failureOf("severity=LOUD").code).toBe("VAL-4002");
    expect(failureOf("type=OTHER").code).toBe("VAL-4002");
    expect(failureOf("code=XXX-1234").code).toBe("VAL-4002");
  });

  it("gives VAL-4003 for a date or a number that does not parse", () => {
    expect(failureOf("startDate=yesterday").code).toBe("VAL-4003");
    expect(failureOf("endDate=2026-10-22").code).toBe("VAL-4003");
    expect(failureOf("page=two").code).toBe("VAL-4003");
    expect(failureOf("limit=1.5").code).toBe("VAL-4003");
  });

  it("gives VAL-4004 when endDate is earlier than startDate", () => {
    const error = failureOf("startDate=2026-10-21T00:00:00Z&endDate=2026-10-20T00:00:00Z");

    expect(error.code).toBe("VAL-4004");
    expect(error.details).toEqual([{ field: "endDate", issue: "must be at or after startDate" }]);
  });

  it("gives VAL-4005 for page below 1 and limit outside 1 to 200", () => {
    expect(failureOf("page=0").code).toBe("VAL-4005");
    expect(failureOf("limit=0").code).toBe("VAL-4005");
    expect(failureOf("limit=201").code).toBe("VAL-4005");
    expect(query("limit=200").limit).toBe(200);
  });

  it("gives VAL-4006 for an id of a wrong form", () => {
    expect(failureOf("id=Not_An_Id").code).toBe("VAL-4006");
  });

  it("takes the first code of the procedure and lists every fault", () => {
    const error = failureOf("severity=LOUD&page=0&limit=500");

    expect(error.code).toBe("VAL-4002");
    expect(error.details).toEqual([
      { field: "severity", issue: "is not one of the allowed values" },
      { field: "page", issue: "must be 1 or more" },
      { field: "limit", issue: "must be from 1 to 200" },
    ]);
  });
});
