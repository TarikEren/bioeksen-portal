/**
 * FND-04 Standard endpoints: the list contract of `GET /api/admin/logs`.
 *
 * FND-04 rule 1 adopts the paths, schemas and principals of `sds-api-design`,
 * and no acceptance criterion of FND-04 states the list rules. So these
 * contract cases (`sds-testing`, `contract-tests.md`, **Responses**) name
 * their source in the title, as `sds-testing` says for a contract case that
 * no criterion adopts. Review 2, R-026.
 *
 * Every request carries an operator token from the local issuer.
 */
import { describe, expect, inject, it } from "vitest";

import { GET as getAdminLogs } from "@/app/api/admin/logs/route";

import { bearer, mintToken } from "../support/operator-token";
import { call, describeAnswer, expectEnvelope, readBody } from "../support/route";

const issuer = inject("testIssuer");

async function asOperator(query: string): Promise<Response> {
  const authorization = bearer(await mintToken(issuer, "operator"));
  return await call(getAdminLogs, `/api/admin/logs${query}`, { headers: { authorization } });
}

/** The list body of `sds-api-design` (`openapi.yaml`, the logs page), read as a record. */
async function expectPage(response: Response): Promise<Record<string, unknown>> {
  const body = await readBody(response);
  expect(response.status, describeAnswer(response, body)).toBe(200);
  expect(body).toMatchObject({
    status: "ok",
    page: expect.any(Number),
    count: expect.any(Number),
    totalCount: expect.any(Number),
    logs: expect.any(Array),
    filterParams: expect.any(Object),
  });
  if (typeof body !== "object" || body === null) {
    throw new Error("The answer has no JSON body.");
  }
  return { ...body };
}

describe("GET /api/admin/logs, list defaults and bounds", () => {
  // Source: sds-api-design, standard-api-endpoints.md (GET /api/admin/logs, Response fields) and app-endpoints.md.
  /** Without page and limit, the page is 1 and the limit 50, and filterParams echoes both. */
  it("FND-04 rule 1, sds-api-design List defaults: the answer echoes the page and the limit it used", async () => {
    const page = await expectPage(await asOperator(""));

    expect(page["page"]).toBe(1);
    expect(page["filterParams"]).toMatchObject({ page: 1, limit: 50 });
  });

  // Source: sds-api-design, standard-api-endpoints.md (Query parameters: limit is 1 to 200).
  /** The limits 1 and 200 are inside the range. */
  it("FND-04 rule 1, sds-api-design Query parameters: each end of the limit range is accepted", async () => {
    for (const limit of [1, 200]) {
      const page = await expectPage(await asOperator(`?limit=${String(limit)}`));
      expect(page["filterParams"], `limit=${String(limit)}`).toMatchObject({ limit });
    }
  });

  // Source: sds-api-design, standard-api-endpoints.md (a page beyond the last one is not an error).
  /** A page past the last one answers 200 with an empty list and the true totalCount. */
  it("FND-04 rule 1, sds-api-design Past the last page: a page past the last is an empty page, not an error", async () => {
    const first = await expectPage(await asOperator("?limit=1"));
    const totalCount = Number(first["totalCount"]);
    expect(totalCount, "precondition: totalCount is a count").toBeGreaterThanOrEqual(0);

    const past = await expectPage(await asOperator(`?limit=1&page=${String(totalCount + 1000)}`));
    expect(past["logs"]).toEqual([]);
    expect(past["count"]).toBe(0);
    // The store only grows during the run, so the true count is at least the earlier one.
    expect(Number(past["totalCount"])).toBeGreaterThanOrEqual(totalCount);
  });
});

describe("GET /api/admin/logs, invalid query parameters", () => {
  const CASES: ReadonlyArray<readonly [string, string, string]> = [
    // [rule, query, code]. The code comes from the selection procedure of sds-logging, code-prefixes.md.
    ["step 15: a severity outside its enumeration", "?severity=NOPE", "VAL-4002"],
    ["step 15: a type outside its enumeration", "?type=NOPE", "VAL-4002"],
    ["step 16: a date that does not parse", "?startDate=yesterday", "VAL-4003"],
    ["step 16: a limit that does not parse", "?limit=many", "VAL-4003"],
    ["step 17: endDate before startDate", "?startDate=2026-09-02T00:00:00Z&endDate=2026-09-01T00:00:00Z", "VAL-4004"],
    ["step 18: a page below 1", "?page=0", "VAL-4005"],
    ["step 18: a limit below 1", "?limit=0", "VAL-4005"],
    ["step 18: a limit above 200", "?limit=201", "VAL-4005"],
  ];

  for (const [rule, query, code] of CASES) {
    // Source: sds-logging, code-prefixes.md (Selection procedure); sds-api-design, standard-api-endpoints.md.
    /** An invalid query parameter gets 400 with the code that the selection procedure gives it. */
    it(`FND-04 rule 1, sds-logging selection procedure, ${rule}`, async () => {
      const envelope = await expectEnvelope(await asOperator(query), 400, code);
      expect(Array.isArray(envelope["details"]) ? envelope["details"].length : 0, "details names the parameter").toBeGreaterThan(0);
    });
  }
});
