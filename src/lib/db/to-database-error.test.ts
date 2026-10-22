import { describe, expect, it } from "vitest";

import { toDatabaseError } from ".";

function driverError(code: string, message = "driver failed"): Error {
  return Object.assign(new Error(message), { code });
}

// Source: sds-logging/references/code-prefixes.md, Database failures; review 1, R-010.
describe("toDatabaseError", () => {
  it("gives RES-4300 for a unique or primary key violation", () => {
    expect(toDatabaseError(driverError("23505"), "write").code).toBe("RES-4300");
  });

  it("gives VAL-4006 for a foreign key on a write, and RES-4302 on a delete", () => {
    expect(toDatabaseError(driverError("23503"), "write").code).toBe("VAL-4006");
    expect(toDatabaseError(driverError("23503"), "delete").code).toBe("RES-4302");
  });

  it("gives RES-4302 for the refusal of platform_refuse_delete()", () => {
    expect(toDatabaseError(driverError("23001"), "delete").code).toBe("RES-4302");
  });

  it("gives RES-4301 for a serialization failure and DB-5002 for any other rollback", () => {
    expect(toDatabaseError(driverError("40001"), "write").code).toBe("RES-4301");
    expect(toDatabaseError(driverError("40P01"), "write").code).toBe("DB-5002");
    expect(toDatabaseError(driverError("40003"), "write").code).toBe("DB-5002");
  });

  it("gives DB-5001 for a check or not-null violation", () => {
    expect(toDatabaseError(driverError("23514"), "write").code).toBe("DB-5001");
    expect(toDatabaseError(driverError("23502"), "write").code).toBe("DB-5001");
  });

  it("gives DB-5500 when the database refused or dropped the connection", () => {
    expect(toDatabaseError(driverError("ECONNREFUSED"), "read").code).toBe("DB-5500");
    expect(toDatabaseError(driverError("57P01"), "write").code).toBe("DB-5500");
    expect(toDatabaseError(new Error("Connection terminated unexpectedly"), "read").code).toBe("DB-5500");
  });

  it("finds the code in the cause of an error", () => {
    expect(toDatabaseError(new Error("wrapped", { cause: driverError("23503") }), "delete").code).toBe("RES-4302");
  });

  it("gives DB-5000 for another failed read and DB-5001 for another failed write or delete", () => {
    expect(toDatabaseError(new Error("boom"), "read").code).toBe("DB-5000");
    expect(toDatabaseError(new Error("boom"), "write").code).toBe("DB-5001");
    expect(toDatabaseError(new Error("boom"), "delete").code).toBe("DB-5001");
  });

  it("never carries the text of the driver in the answer", () => {
    expect(toDatabaseError(driverError("23505", "duplicate key value violates unique constraint secret_idx"), "write").message).not.toContain(
      "secret_idx",
    );
  });
});
