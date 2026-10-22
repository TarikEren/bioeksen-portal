/**
 * Reads the local log store `platform_log_record` (DEC-127) of the disposable
 * integration database, for the cases that assert what the app logged
 * (`sds-testing`, `contract-tests.md`, **Logging** and **Errors**).
 *
 * The integration setup has already checked the database with the guard, and
 * set `DATABASE_URL` to it. This helper only reads.
 */
import { Client } from "pg";
import { expect } from "vitest";

import { type LogType, type Severity, hasTailPair } from "./log-records";

/** A row of the store, with the fields of a record that the tests read. */
export interface StoredRecord {
  readonly severity: Severity;
  readonly type: LogType;
  readonly code: string | null;
  readonly message: string;
}

export interface LogStore {
  /** The records of one request (`request=<id>` in the tail), in the order of the store. */
  recordsOfRequest(requestId: string): Promise<StoredRecord[]>;
  /** Waits until a record of the request holds, and returns the records of the request. */
  waitForRecordOfRequest(
    requestId: string,
    predicate: (record: StoredRecord) => boolean,
    description: string,
  ): Promise<StoredRecord[]>;
  /** The number of records whose message holds the text anywhere. */
  countContaining(text: string): Promise<number>;
  close(): Promise<void>;
}

/** Opens the store of `DATABASE_URL`, the disposable database of the integration worker. */
export async function openLogStore(): Promise<LogStore> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();

  const recordsOfRequest = async (requestId: string): Promise<StoredRecord[]> => {
    const result = await client.query<StoredRecord>(
      "SELECT severity, type, code, message FROM platform_log_record WHERE strpos(message, $1) > 0 ORDER BY id",
      [`request=${requestId}`],
    );
    return result.rows.filter((row) => hasTailPair(row.message, "request", requestId));
  };

  return {
    recordsOfRequest,
    waitForRecordOfRequest: async (requestId, predicate, description) => {
      await expect
        .poll(async () => (await recordsOfRequest(requestId)).some(predicate), {
          timeout: 10_000,
          interval: 200,
          message: `${description} (request=${requestId}) is in platform_log_record`,
        })
        .toBe(true);
      return await recordsOfRequest(requestId);
    },
    countContaining: async (text) => {
      const result = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM platform_log_record WHERE strpos(message, $1) > 0 OR strpos(coalesce(code, ''), $1) > 0",
        [text],
      );
      return result.rows[0]?.count ?? -1;
    },
    close: async () => {
      await client.end();
    },
  };
}

/** A short form of stored records for a failure message. */
export function describeStored(records: readonly StoredRecord[]): string {
  return records.length === 0
    ? "(no record)"
    : records.map((record) => `${record.severity} ${record.type} ${record.code ?? "-"}: ${record.message}`).join("\n");
}
