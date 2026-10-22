import { describe, expect, it } from "vitest";

import { AppError, NotImplemented } from "./app-error";
import { failureEnvelope } from "./envelope";

// Source: the Error schema of sds-api-design/references/openapi.yaml, and
// sds-logging/references/code-prefixes.md, "Not implemented".
describe("failureEnvelope", () => {
  it("carries the status fail, the code, the message and the details of the error", () => {
    const error = new AppError("VAL-4007", "Unknown field", {
      details: [{ field: "extra", issue: "is not a field of this endpoint" }],
    });

    expect(failureEnvelope(error)).toEqual({
      status: "fail",
      code: "VAL-4007",
      message: "Unknown field",
      details: [{ field: "extra", issue: "is not a field of this endpoint" }],
    });
  });

  it("gives null details when the error has none", () => {
    expect(failureEnvelope(new AppError("RES-4200", "Not found")).details).toBeNull();
  });

  it("answers an operation that is not implemented as SYS-5000, never as 501", () => {
    const error = new NotImplemented("someOperation");

    expect(error.status).toBe(500);
    expect(failureEnvelope(error)).toEqual({
      status: "fail",
      code: "SYS-5000",
      message: "Not implemented",
      details: null,
    });
  });

  it("does not carry the name of the operation in the answer", () => {
    expect(JSON.stringify(failureEnvelope(new NotImplemented("someOperation")))).not.toContain("someOperation");
  });
});
