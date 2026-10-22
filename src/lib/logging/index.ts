/**
 * The in-app logger (DEC-127, FND-05 rule 1).
 *
 * It writes the records of `sds-logging` (`log-record.md`) to stdout as JSON
 * lines and to the local store `platform_log_record`. It sends nothing to the
 * aggregator. This departs from `sds-logging` and is recorded in DEC-127.
 *
 * Rules that this file keeps:
 * - A failure of the logger never fails the operation. A record that the
 *   store refuses goes to stderr.
 * - The write to the store never blocks the request path. It runs on a queue.
 * - `FATAL` logs and returns. It never ends the process.
 * - The `id` is the content of `.bioeksen/software-id` (DEC-021), never an
 *   environment variable (`sds-config`, **Not configuration**).
 */
import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getConfigState, getLogLevel } from "@/lib/config";
import { AppError, type ErrorCode } from "@/lib/errors";
import { findRequestContext } from "@/lib/request-context";

import { logTypeOfCode, proseOfCode, severityOfCode } from "./derive";
import { buildMessage, describeError, redactText } from "./format";
import { LOG_TYPES, SEVERITIES, type LogType, type Severity } from "./severities";
import { insertLogRecords, type StoredLogRecord } from "./store";

export { LOG_TYPES, SEVERITIES } from "./severities";
export type { LogType, Severity } from "./severities";
export { findLogRecords } from "./store";
export type { LogRecordFilter, LogRecordPage, StoredLogRecord } from "./store";

/** A record as emitted: the six fields of `log-record.md`. */
export interface LogRecord {
  /** The software id. */
  readonly id: string;
  /** RFC 3339 with offset, at least millisecond precision. */
  readonly timestamp: string;
  readonly severity: Severity;
  readonly type: LogType;
  /** `null` when the record does not describe a failure. */
  readonly code: ErrorCode | null;
  readonly message: string;
}

/** A value of the structured tail. The logger quotes and escapes it. */
export type TailValue = string | number | boolean;

export interface LogEntry {
  readonly severity: Severity;
  readonly type: LogType;
  /** Required when the severity is `ERROR` or `FATAL`. */
  readonly code?: ErrorCode;
  /** The prose. The logger adds the structured tail and never repeats the code. */
  readonly message: string;
  /** The `key=value` pairs after the prose. `request=` comes from the request context. */
  readonly tail?: Readonly<Record<string, TailValue>>;
}

export interface FailureOptions {
  /** Pairs for the tail, beside `request=`. */
  readonly tail?: Readonly<Record<string, TailValue>>;
  /** The error behind the failure. Its text goes under `error=` and `cause=`, redacted. */
  readonly error?: unknown;
  /** Replaces the derived severity. Only for a case the table of `code-prefixes.md` leaves to the app. */
  readonly severity?: Severity;
}

export interface Logger {
  /** Writes one record. A failure of the logger never fails the operation (`log-record.md`, **Emission rules**). */
  write(entry: LogEntry): void;
  /**
   * Writes the record of a failure. The code decides the severity, the type and
   * the prose, so the record and the answer of the same failure carry one code.
   */
  failure(code: ErrorCode, options?: FailureOptions): void;
  /** Waits until the queue has reached the local store. Tests and `GET /api/admin/logs` use it. */
  flush(): Promise<void>;
}

const SOFTWARE_ID_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SOFTWARE_ID_MAX_LENGTH = 63;

let softwareId: string | undefined;

/**
 * Reads the software id from the nearest `.bioeksen/software-id`, from the
 * working directory up.
 *
 * @throws AppError `CFG-5000` when no file holds an id, `CFG-5001` when the id
 * has a form that `log-record.md` does not allow.
 */
export function readSoftwareId(): string {
  if (softwareId !== undefined) {
    return softwareId;
  }
  let directory = process.cwd();
  for (;;) {
    const candidate = path.join(directory, ".bioeksen", "software-id");
    if (existsSync(candidate)) {
      const value = readFileSync(candidate, "utf8").trim();
      if (value === "") {
        break;
      }
      if (value.length > SOFTWARE_ID_MAX_LENGTH || !SOFTWARE_ID_FORMAT.test(value)) {
        throw new AppError("CFG-5001", "The software id has a form that is not allowed");
      }
      softwareId = value;
      return value;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  throw new AppError("CFG-5000", "The software id is not supplied");
}

/** The most records that wait for the store. The oldest record that is not `AUDIT` drops first. */
const MAX_QUEUE_LENGTH = 10_000;

/** The least time between two notices on stderr about the store. */
const STORE_NOTICE_INTERVAL_MS = 30_000;

const queue: StoredLogRecord[] = [];
let draining: Promise<void> | undefined;
let lastNoticeAt = 0;

/** The local error channel (`log-record.md`, **Emission rules**): one line on stderr. */
function writeLocalError(code: ErrorCode, text: string): void {
  const context = findRequestContext();
  const request = context === undefined ? "" : ` request=${context.requestId}`;
  try {
    process.stderr.write(`${JSON.stringify({ code, message: `${redactText(text)}${request}` })}\n`);
  } catch {
    // Nothing is left to try.
  }
}

/**
 * The stack of an unhandled failure goes to stderr, as one line with the code
 * and the request id, and never into a record (`log-record.md`, **Message**).
 */
function writeStack(code: ErrorCode, error: unknown): void {
  if (error instanceof Error && error.stack !== undefined) {
    writeLocalError(code, `stack ${JSON.stringify(redactText(error.stack))}`);
  }
}

function noticeStoreFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastNoticeAt < STORE_NOTICE_INTERVAL_MS) {
    return;
  }
  lastNoticeAt = now;
  writeLocalError("DB-5001", `log store write failed error=${JSON.stringify(describeError(error).error)}`);
}

function enqueue(record: StoredLogRecord): void {
  if (queue.length >= MAX_QUEUE_LENGTH) {
    const droppable = queue.findIndex((queued) => queued.type !== "AUDIT");
    if (droppable === -1) {
      // Only `AUDIT` records wait. None drops.
      queue.push(record);
    } else {
      queue.splice(droppable, 1);
      queue.push(record);
    }
  } else {
    queue.push(record);
  }
  draining ??= drain().finally(() => {
    draining = undefined;
  });
}

async function drain(): Promise<void> {
  // Let the caller of `write` return first.
  await Promise.resolve();
  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length);
    try {
      await insertLogRecords(batch);
    } catch (error) {
      noticeStoreFailure(error);
      // An `AUDIT` record stays until the store has it. Another record is lost.
      queue.unshift(...batch.filter((record) => record.type === "AUDIT"));
      return;
    }
  }
}

function storeIsConfigured(): boolean {
  return getConfigState().status === "ready";
}

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3, FATAL: 4 };

function write(entry: LogEntry): void {
  try {
    if (SEVERITY_RANK[entry.severity] < SEVERITY_RANK[getLogLevel()]) {
      return;
    }
    if ((entry.severity === "ERROR" || entry.severity === "FATAL") && entry.code === undefined) {
      writeLocalError("LOG-4000", `record refused: ${entry.severity} without a code`);
      return;
    }
    if (!SEVERITIES.includes(entry.severity) || !LOG_TYPES.includes(entry.type)) {
      writeLocalError("LOG-4000", "record refused: severity or type outside the closed sets");
      return;
    }

    const context = findRequestContext();
    const tail = context === undefined ? { ...entry.tail } : { request: context.requestId, ...entry.tail };
    const record: LogRecord = {
      id: readSoftwareId(),
      timestamp: new Date().toISOString(),
      severity: entry.severity,
      type: entry.type,
      code: entry.code ?? null,
      message: buildMessage(entry.message, tail),
    };

    process.stdout.write(`${JSON.stringify(record)}\n`);

    if (storeIsConfigured()) {
      enqueue({
        softwareId: record.id,
        timestamp: record.timestamp,
        severity: record.severity,
        type: record.type,
        code: record.code,
        message: record.message,
      });
    }
  } catch (error) {
    // Logging never fails the operation being logged.
    writeLocalError("SYS-5000", `logger failed error=${JSON.stringify(describeError(error).error)}`);
  }
}

export const logger: Logger = {
  write,

  failure(code: ErrorCode, options: FailureOptions = {}): void {
    const errorTail = options.error === undefined ? {} : describeError(options.error);
    write({
      severity: options.severity ?? severityOfCode(code),
      type: logTypeOfCode(code),
      code,
      message: proseOfCode(code),
      tail: { ...options.tail, ...errorTail },
    });
    if (severityOfCode(code) !== "WARNING") {
      writeStack(code, options.error);
    }
  },

  async flush(): Promise<void> {
    while (draining !== undefined) {
      await draining;
    }
  },
};
