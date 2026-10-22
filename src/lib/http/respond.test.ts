import { describe, expect, it } from "vitest";

import { AppError, NotImplemented } from "@/lib/errors";

import { failureResponse } from "./respond";

// Source: sds-api-design (error envelope) and error-codes.md (status of a code).
describe("failureResponse", () => {
  it("answers with the status of the code and the failure envelope as JSON", async () => {
    const response = failureResponse(new AppError("RES-4500", "Method not allowed"));

    expect(response.status).toBe(405);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      status: "fail",
      code: "RES-4500",
      message: "Method not allowed",
      details: null,
    });
  });

  it("answers an operation that is not implemented with 500 SYS-5000", async () => {
    const response = failureResponse(new NotImplemented("GET /x"));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ status: "fail", code: "SYS-5000" });
  });
});
