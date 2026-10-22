import { describe, expect, it, vi } from "vitest";

const reads: unknown[] = [];

vi.mock("@/lib/logging", () => ({
  logger: { flush: () => Promise.resolve() },
  findLogRecords: (filter: unknown) => {
    reads.push(filter);
    return Promise.resolve({
      totalCount: 1,
      records: [
        {
          softwareId: "bioeksen-portal",
          timestamp: "2026-10-22T10:00:00.000Z",
          severity: "WARNING",
          type: "APP",
          code: "VAL-4007",
          message: "unknown field",
        },
      ],
    });
  },
}));

const { listLogs } = await import("./log-service");

const operator = { kind: "operator", subject: "person-1" } as const;
const now = new Date("2026-10-22T12:00:00.000Z");

// Source: sds-nextjs-backend sections 1 and 3 (the service checks the caller); review 1, R-008;
// standard-api-endpoints.md (GET /api/admin/logs response).
describe("listLogs", () => {
  it("answers a page of the six fields for an operator", async () => {
    const page = await listLogs(operator, new URLSearchParams("limit=10"), now);

    expect(page).toMatchObject({ page: 1, count: 1, totalCount: 1 });
    expect(page.logs).toEqual([
      {
        id: "bioeksen-portal",
        timestamp: "2026-10-22T10:00:00.000Z",
        severity: "WARNING",
        type: "APP",
        code: "VAL-4007",
        message: "unknown field",
      },
    ]);
    expect(page.filterParams).toMatchObject({ page: 1, limit: 10, id: null, endDate: now.toISOString() });
  });

  it("refuses a caller that is not an operator, and reads nothing", async () => {
    reads.length = 0;
    const app: unknown = { kind: "app", subject: "service-1" };

    await expect(Reflect.apply(listLogs, undefined, [app, new URLSearchParams(), now])).rejects.toMatchObject({
      code: "PERM-4151",
    });
    await expect(Reflect.apply(listLogs, undefined, [null, new URLSearchParams(), now])).rejects.toMatchObject({
      code: "PERM-4151",
    });
    expect(reads).toEqual([]);
  });

  it("refuses a bad query with the code of the procedure", async () => {
    await expect(listLogs(operator, new URLSearchParams("limit=0"), now)).rejects.toMatchObject({ code: "VAL-4005" });
  });
});
