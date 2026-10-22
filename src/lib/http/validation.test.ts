import { describe, expect, it } from "vitest";
import { z } from "zod";

import { bodyValidationError } from "./validation";

const schema = z.strictObject({
  value: z.string(),
  mode: z.enum(["a", "b"]).optional(),
  count: z.number().int().min(1).optional(),
});

function errorOf(input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error("the schema accepted the input");
  }
  return bodyValidationError(input, result.error);
}

// Source: code-prefixes.md (selection procedure, steps 14 to 20) and error-codes.md
// (a response carries one code; the other faults are details).
describe("bodyValidationError", () => {
  it("gives VAL-4001 for a field that is absent", () => {
    const error = errorOf({});

    expect(error.code).toBe("VAL-4001");
    expect(error.details).toEqual([{ field: "value", issue: "is required" }]);
  });

  it("gives VAL-4006 for a field of the wrong type, not VAL-4001", () => {
    const error = errorOf({ value: 12 });

    expect(error.code).toBe("VAL-4006");
    expect(error.details).toEqual([{ field: "value", issue: "must be of the type string" }]);
  });

  it("gives VAL-4001 for an enumerated field that is absent, not VAL-4002", () => {
    const required = z.strictObject({ mode: z.enum(["a", "b"]) });
    const input = {};
    const result = required.safeParse(input);
    if (result.success) {
      throw new Error("the schema accepted the input");
    }

    expect(bodyValidationError(input, result.error).code).toBe("VAL-4001");
  });

  it("gives VAL-4002 for a value outside its enumeration", () => {
    expect(errorOf({ value: "x", mode: "c" }).code).toBe("VAL-4002");
  });

  it("gives VAL-4007 for a field that the endpoint does not define, and names it", () => {
    const error = errorOf({ value: "x", extra: 1 });

    expect(error.code).toBe("VAL-4007");
    expect(error.details).toEqual([{ field: "extra", issue: "is not a field of this endpoint" }]);
  });

  it("takes the first code of the procedure and lists every fault", () => {
    const error = errorOf({ mode: "c", extra: true });

    expect(error.code).toBe("VAL-4001");
    expect(error.details).toEqual(
      expect.arrayContaining([
        { field: "value", issue: "is required" },
        { field: "mode", issue: "is not one of the allowed values" },
        { field: "extra", issue: "is not a field of this endpoint" },
      ]),
    );
  });

  it("names a body that is not an object as the field body", () => {
    expect(errorOf([]).details).toEqual([{ field: "body", issue: "must be of the type object" }]);
  });

  it("never quotes the value that the caller sent", () => {
    const sent = "caller-secret-value-91";

    expect(JSON.stringify(errorOf({ value: 7, mode: sent, count: sent }).details)).not.toContain(sent);
  });
});
