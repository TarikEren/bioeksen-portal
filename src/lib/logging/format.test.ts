import { describe, expect, it } from "vitest";

import type { ErrorCode } from "@/lib/errors";

import { logTypeOfCode, proseOfCode, severityOfCode } from "./derive";
import { MAX_MESSAGE_LENGTH, buildMessage, describeError, formatTail, redactText } from "./format";

// Source: sds-logging/references/log-record.md (Message, Structured tail) and
// code-prefixes.md (Derived attributes).
describe("the tail of a record", () => {
  it("writes key=value pairs after the prose", () => {
    expect(buildMessage("write failed", { request: "8c21", attempts: 3 })).toBe("write failed request=8c21 attempts=3");
  });

  it("quotes a value with a space, an equals sign or a quote, and escapes quote and backslash", () => {
    expect(formatTail({ a: "two words", b: "x=y", c: 'say "hi"', d: "back\\slash", e: "" })).toBe(
      'a="two words" b="x=y" c="say \\"hi\\"" d="back\\\\slash" e=""',
    );
  });

  it("keeps a message on one line", () => {
    const message = buildMessage("write failed", { error: "first\nsecond\r\nthird" });

    expect(message).not.toMatch(/[\r\n]/);
    expect(message).toBe('write failed error="first second third"');
  });

  it("writes keys as lowercase [a-z0-9_] and keeps the first of a repeated key", () => {
    expect(formatTail({ "Bad Key": "1", bad_key: "2" })).toBe("bad_key=1");
  });

  it("holds at most 8192 characters", () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`k${String(index)}`, "x".repeat(2000)]));

    expect(buildMessage("write failed", many).length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  });
});

describe("redaction", () => {
  it("removes a bearer credential, a token and a password in free text", () => {
    const text = redactText("Authorization: Bearer abc.def.ghi password=hunter2 token: s3cr3t");

    expect(text).not.toContain("abc.def.ghi");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("s3cr3t");
  });

  it("removes the password of a connection string", () => {
    const text = redactText("connect failed postgresql://app:pa55w0rd-xyz@db.example.invalid:5432/app");

    expect(text).not.toContain("pa55w0rd-xyz");
    expect(text).toContain("db.example.invalid");
  });

  it("removes a JSON Web Token and an email address", () => {
    const token = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
    const text = redactText(`seen ${token} for person@example.invalid`);

    expect(text).not.toContain(token);
    expect(text).not.toContain("person@example.invalid");
  });

  it("writes no value for a key that names a secret", () => {
    expect(formatTail({ password: "hunter2", session_id: "abc", reason: "fine" })).toBe(
      "password=[redacted] session_id=[redacted] reason=fine",
    );
  });

  it("redacts the text of an error that quotes a connection string", () => {
    const error = new Error("connect ECONNREFUSED", { cause: new Error("postgres://u:topsecret-1@h:5/d refused") });
    const { error: text, cause } = describeError(error);

    expect(`${text} ${cause ?? ""}`).toContain("topsecret-1");
    expect(buildMessage("query failed", { error: text, ...(cause === undefined ? {} : { cause }) })).not.toContain(
      "topsecret-1",
    );
  });
});

describe("the attributes that the code decides", () => {
  it("gives WARNING for a 4xxx code and ERROR for a 5xxx code", () => {
    expect(severityOfCode("VAL-4007")).toBe("WARNING");
    expect(severityOfCode("AUTH-4101")).toBe("WARNING");
    expect(severityOfCode("DB-5001")).toBe("ERROR");
    expect(severityOfCode("SYS-5000")).toBe("ERROR");
  });

  it("gives FATAL for DB-5500, CFG-5000 and CFG-5001", () => {
    const codes: readonly ErrorCode[] = ["DB-5500", "CFG-5000", "CFG-5001"];

    expect(codes.map((code) => severityOfCode(code))).toEqual(["FATAL", "FATAL", "FATAL"]);
  });

  it("gives SECURITY for AUTH and PERM codes, JOB for JOB codes, else APP", () => {
    expect(logTypeOfCode("AUTH-4100")).toBe("SECURITY");
    expect(logTypeOfCode("PERM-4151")).toBe("SECURITY");
    expect(logTypeOfCode("JOB-5000")).toBe("JOB");
    expect(logTypeOfCode("VAL-4000")).toBe("APP");
  });

  it("writes the prose as the meaning with only its first character lowercased", () => {
    expect(proseOfCode("DB-5001")).toBe("write failed");
    expect(proseOfCode("VAL-4004")).toBe("endDate earlier than startDate");
    expect(proseOfCode("SYS-5000")).toBe("unhandled error");
  });
});
