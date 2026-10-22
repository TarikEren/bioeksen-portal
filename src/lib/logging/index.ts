/**
 * The in-app logger (DEC-127, FND-05 rule 1).
 *
 * It writes the records of `sds-logging` (`log-record.md`) to stdout and to the
 * local store `platform_log_record`. It sends nothing to the aggregator. This
 * departs from `sds-logging` and is recorded in DEC-127.
 *
 * Skeleton of stage B0: the names and the signatures. Every method throws
 * `NotImplemented`. The logger is one module-level instance (`sds-nextjs-backend`
 * §1). Its `id` is the content of `.bioeksen/software-id` (DEC-021), never an
 * environment variable (`sds-config`, **Not configuration**).
 */
import "server-only";

import { type ErrorCode, NotImplemented } from "@/lib/errors";

import type { LogType, Severity } from "./severities";

export { LOG_TYPES, SEVERITIES } from "./severities";
export type { LogType, Severity } from "./severities";

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

export interface Logger {
  /** Writes one record. A failure of the logger never fails the operation (`log-record.md`, **Emission rules**). */
  write(entry: LogEntry): void;
}

/** Reads the software id from the nearest `.bioeksen/software-id`. */
export function readSoftwareId(): string {
  throw new NotImplemented("readSoftwareId");
}

export const logger: Logger = {
  write(entry: LogEntry): void {
    void entry;
    throw new NotImplemented("logger.write");
  },
};
