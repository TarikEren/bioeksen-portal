/**
 * FND-05 Errors, logs and correlation: the record of a failure, and the
 * secrets a record never holds.
 *
 * FND-05 rule 1 adopts the record form of `sds-logging`, and rule 5 its list
 * of what a record never holds. No acceptance criterion of B0 states the
 * severity, the type or the prose of a record, so these contract cases
 * (`sds-testing`, `contract-tests.md`, **Errors** and **Logging**) name their
 * source in the title. Review 2, R-026.
 *
 * The records are read from the local store `platform_log_record` (DEC-127).
 */
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { GET as getHealth } from "@/app/api/health/route";
import { POST as postEcho } from "@/app/api/test/echo/route";

import { type LogStore, type StoredRecord, describeStored, openLogStore } from "../support/log-store";
import { type TokenKind, bearer, mintToken } from "../support/operator-token";
import { call } from "../support/route";

const issuer = inject("testIssuer");

let store: LogStore;

beforeAll(async () => {
  store = await openLogStore();
});

afterAll(async () => {
  await store.close();
});

function newRequestId(): string {
  return `qa-${randomBytes(8).toString("hex")}`;
}

/** The prose of a code: its meaning in `code-prefixes.md`, with the first character lowercased. */
const PROSE: Readonly<Record<string, string>> = {
  "AUTH-4100": "credential missing",
  "PERM-4151": "operator role required",
  "VAL-4007": "unknown field",
};

interface FailureCase {
  readonly rule: string;
  readonly code: string;
  readonly severity: "WARNING" | "ERROR";
  readonly type: "SECURITY" | "APP";
  readonly send: (requestId: string) => Promise<Response>;
}

const FAILURES: readonly FailureCase[] = [
  {
    rule: "a request with no credential",
    code: "AUTH-4100",
    severity: "WARNING",
    type: "SECURITY",
    send: async (requestId) => await call(getHealth, "/api/health", { headers: { "x-request-id": requestId } }),
  },
  {
    rule: "a credential that is not an operator",
    code: "PERM-4151",
    severity: "WARNING",
    type: "SECURITY",
    send: async (requestId) =>
      await call(getHealth, "/api/health", {
        headers: { "x-request-id": requestId, authorization: bearer(await mintToken(issuer, "app")) },
      }),
  },
  {
    rule: "a body field that the endpoint does not define",
    code: "VAL-4007",
    severity: "WARNING",
    type: "APP",
    send: async (requestId) =>
      await call(postEcho, "/api/test/echo", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify({ value: "qa", qaUnknownField: 1 }),
      }),
  },
];

async function recordOfFailure(failure: FailureCase): Promise<StoredRecord> {
  const requestId = newRequestId();
  const response = await failure.send(requestId);
  expect(response.headers.get("x-request-id"), "precondition: the answer carries the request id").toBe(requestId);
  const records = await store.waitForRecordOfRequest(
    requestId,
    (record) => record.code === failure.code,
    `a record with the code ${failure.code}`,
  );
  const record = records.find((entry) => entry.code === failure.code);
  if (record === undefined) {
    throw new Error(`No record with ${failure.code}:\n${describeStored(records)}`);
  }
  return record;
}

describe("FND-05 the record of a failure", () => {
  for (const failure of FAILURES) {
    // Source: sds-logging, code-prefixes.md (Derived attributes: Severity).
    /** A failure record has the severity that its code gives: WARNING for a 4xxx code. */
    it(`FND-05 rule 1, sds-logging Severity from the code: ${failure.rule}`, async () => {
      const record = await recordOfFailure(failure);
      expect(record.severity, describeStored([record])).toBe(failure.severity);
    });

    // Source: sds-logging, code-prefixes.md (Derived attributes: Log type).
    /** A failure record has the type that its code gives: SECURITY for AUTH- and PERM-, else APP. */
    it(`FND-05 rule 1, sds-logging Type from the code: ${failure.rule}`, async () => {
      const record = await recordOfFailure(failure);
      expect(record.type, describeStored([record])).toBe(failure.type);
    });

    // Source: sds-logging, code-prefixes.md (Derived attributes: Message prose) and log-record.md (Structured tail).
    /** The message of a failure record is the meaning of its code, first letter lowercased, then the logfmt tail. */
    it(`FND-05 rule 1, sds-logging Fixed prose: ${failure.rule}`, async () => {
      const record = await recordOfFailure(failure);
      const prose = PROSE[failure.code] ?? "(no prose in the test table)";
      const escaped = prose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(record.message, describeStored([record])).toMatch(new RegExp(`^${escaped}(?: [a-z0-9_]+=.*)?$`));
    });
  }
});

describe("FND-05 secrets in the records", () => {
  const KINDS: ReadonlyArray<readonly [TokenKind, string]> = [
    ["operator", "an operator token that the app accepts"],
    ["wrong-signature", "a token that the app refuses"],
    ["person-without-role", "a token of a person who is not an operator"],
  ];

  for (const [kind, label] of KINDS) {
    // Source: sds-logging, SKILL.md (What MUST NOT be logged: tokens, Authorization header contents); FND-05 rule 5.
    /** A request with a bearer token is logged, and no record holds the token or its signature. */
    it(`FND-05 rule 5, sds-logging No secrets: ${label} is in no record`, async () => {
      const token = await mintToken(issuer, kind);
      const requestId = newRequestId();
      await call(getHealth, "/api/health", { headers: { "x-request-id": requestId, authorization: bearer(token) } });

      // Precondition: the request was logged, so an absence below is not the absence of every record.
      await store.waitForRecordOfRequest(requestId, () => true, "a record of the request");

      const [, payload = "", signature = ""] = token.split(".");
      expect(payload.length > 0 && signature.length > 0, "precondition: the token has three parts").toBe(true);
      expect(await store.countContaining(token), "records that hold the token").toBe(0);
      expect(await store.countContaining(signature), "records that hold the signature of the token").toBe(0);
      expect(await store.countContaining(payload), "records that hold the payload of the token").toBe(0);
    });
  }
});
