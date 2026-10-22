import { describe, expect, it } from "vitest";

import { ERROR_CODES, type ErrorCode, httpStatusOf } from "./codes";

// Source: the HTTP mapping table of sds-logging/references/error-codes.md.
describe("httpStatusOf (error-codes.md, HTTP mapping)", () => {
  const cases: readonly (readonly [ErrorCode, number])[] = [
    ["VAL-4000", 400],
    ["VAL-4007", 400],
    ["AUTH-4100", 401],
    ["AUTH-4103", 401],
    ["PERM-4150", 403],
    ["PERM-4151", 403],
    ["RES-4200", 404],
    ["RES-4301", 409],
    ["RATE-4400", 429],
    ["RES-4500", 405],
    ["VAL-4550", 413],
    ["VAL-4600", 415],
    ["SYS-5000", 500],
    ["CFG-5001", 500],
    ["AUTH-5500", 503],
    ["SYS-5500", 503],
  ];

  it.each(cases)("maps %s to %i", (code, status) => {
    expect(httpStatusOf(code)).toBe(status);
  });

  it("gives every code of the registry a status in 400..599", () => {
    for (const code of ERROR_CODES) {
      const status = httpStatusOf(code);
      expect(status, `status of ${code}`).toBeGreaterThanOrEqual(400);
      expect(status, `status of ${code}`).toBeLessThanOrEqual(599);
    }
  });

  it("gives a 4xxx code a 4xx status and a 5xxx code a 5xx status", () => {
    for (const code of ERROR_CODES) {
      const faultDigit = code.slice(code.indexOf("-") + 1, code.indexOf("-") + 2);
      expect(String(httpStatusOf(code)).slice(0, 1), `fault of ${code}`).toBe(faultDigit);
    }
  });
});
