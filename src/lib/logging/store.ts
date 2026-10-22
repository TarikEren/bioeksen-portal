/**
 * The local store of log records: the table `platform_log_record` (DEC-127,
 * FND-04 rule 3). It is the repository of the logger and of
 * `GET /api/admin/logs`.
 *
 * It holds queries and nothing else. It never decides who may read.
 */
import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestamptzString } from "@prisma/orm-postgres/target/codec-types";

import { getDb, toDatabaseError } from "@/lib/db";

import type { LogType, Severity } from "./severities";

/** A record as stored. `code` is `null` for a record that is not a failure. */
export interface StoredLogRecord {
  readonly softwareId: string;
  /** RFC 3339 with offset, millisecond precision. */
  readonly timestamp: string;
  readonly severity: Severity;
  readonly type: LogType;
  readonly code: string | null;
  readonly message: string;
}

export interface LogRecordFilter {
  readonly startDate: string;
  readonly endDate: string;
  readonly severity: Severity | null;
  readonly type: LogType | null;
  readonly softwareId: string | null;
  readonly code: string | null;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
}

export interface LogRecordPage {
  readonly totalCount: number;
  readonly records: readonly StoredLogRecord[];
}

/** An RFC 3339 instant with an offset. */
const INSTANT_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Gives an instant the brand of the column `timestamp` (`timestamptz(3)`). The
 * brand has no runtime form, so this is the one place that makes it, and only
 * after the text is checked to be an instant.
 */
function asColumnInstant(instant: string): TimestamptzString<3> {
  if (!INSTANT_FORMAT.test(instant) || Number.isNaN(Date.parse(instant))) {
    throw new Error("The text is not an RFC 3339 instant with an offset");
  }
  return instant as TimestamptzString<3>;
}

/** The rows that one insert statement carries at most. */
const INSERT_BATCH_SIZE = 100;

/** Writes records. One statement for each batch of at most `INSERT_BATCH_SIZE`. */
export async function insertLogRecords(records: readonly StoredLogRecord[]): Promise<void> {
  const collection = getDb().orm.public.PlatformLogRecord;
  for (let start = 0; start < records.length; start += INSERT_BATCH_SIZE) {
    const batch = records.slice(start, start + INSERT_BATCH_SIZE);
    await collection.createAll(
      batch.map((record) => ({
        softwareId: record.softwareId,
        timestamp: asColumnInstant(record.timestamp),
        severity: record.severity,
        type: record.type,
        code: record.code,
        message: record.message,
      })),
    );
  }
}

/**
 * The text form that PostgreSQL gives a `timestamptz` (`2026-10-22 10:00:00.123+00`)
 * as an RFC 3339 instant with the offset `Z`.
 */
export function toInstantString(stored: string): string {
  const normalized = stored.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return new Date(normalized).toISOString();
}

/**
 * Reads one page, newest first. Records of one instant keep a stable order by
 * the row id, ascending (`standard-api-endpoints.md`, `GET /api/admin/logs`).
 */
export async function findLogRecords(filter: LogRecordFilter): Promise<LogRecordPage> {
  try {
    return await readLogRecords(filter);
  } catch (error) {
    throw toDatabaseError(error, "read");
  }
}

async function readLogRecords(filter: LogRecordFilter): Promise<LogRecordPage> {
  const collection = getDb().orm.public.PlatformLogRecord;
  const matching = collection.where((row) =>
    and(
      row.timestamp.gte(asColumnInstant(filter.startDate)),
      row.timestamp.lte(asColumnInstant(filter.endDate)),
      ...(filter.severity === null ? [] : [row.severity.eq(filter.severity)]),
      ...(filter.type === null ? [] : [row.type.eq(filter.type)]),
      ...(filter.softwareId === null ? [] : [row.softwareId.eq(filter.softwareId)]),
      ...(filter.code === null ? [] : [row.code.eq(filter.code)]),
    ),
  );

  const [totals, rows] = await Promise.all([
    matching.aggregate((aggregate) => ({ total: aggregate.count() })),
    matching
      .orderBy([(row) => row.timestamp.desc(), (row) => row.id.asc()])
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .all(),
  ]);

  return {
    totalCount: totals.total,
    records: rows.map((row) => ({
      softwareId: row.softwareId,
      timestamp: toInstantString(row.timestamp),
      severity: asSeverity(row.severity),
      type: asLogType(row.type),
      code: row.code,
      message: row.message,
    })),
  };
}

const SEVERITY_VALUES: readonly Severity[] = ["DEBUG", "INFO", "WARNING", "ERROR", "FATAL"];
const TYPE_VALUES: readonly LogType[] = ["APP", "SECURITY", "AUDIT", "ACCESS", "JOB"];

/** The check constraints keep other values out. A value that is not known is a defect of the store. */
function asSeverity(value: string): Severity {
  const known = SEVERITY_VALUES.find((severity) => severity === value);
  if (known === undefined) {
    throw new Error("The store holds a severity that is not in the closed set");
  }
  return known;
}

function asLogType(value: string): LogType {
  const known = TYPE_VALUES.find((type) => type === value);
  if (known === undefined) {
    throw new Error("The store holds a type that is not in the closed set");
  }
  return known;
}
