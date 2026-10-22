/**
 * Reads log records from the output of a spawned app (DEC-127).
 *
 * The in-app logger writes each record to stdout in the form of `sds-logging`
 * (`log-record.md`). That document allows the JSON record or the rendered
 * line `[timestamp] [severity] [type] [id] [code]: [message]`, so this reader
 * accepts both, one record for each line. Other lines (the banner of
 * `next start`) are not records and are skipped.
 */

export const SEVERITIES = ["DEBUG", "INFO", "WARNING", "ERROR", "FATAL"] as const;
export const LOG_TYPES = ["APP", "SECURITY", "AUDIT", "ACCESS", "JOB"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type LogType = (typeof LOG_TYPES)[number];

/** The six fields of a record (`sds-logging`, `log-record.md`). */
export interface LogRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly severity: Severity;
  readonly type: LogType;
  readonly code: string | null;
  readonly message: string;
}

const RENDERED =
  /^\[?(\d{4}-\d{2}-\d{2}T[^\s\]]+)\]? \[?(DEBUG|INFO|WARNING|ERROR|FATAL)\]? \[?(APP|SECURITY|AUDIT|ACCESS|JOB)\]? \[?([a-z0-9]+(?:-[a-z0-9]+)*)\]? \[?([A-Z][A-Z0-9]{1,7}-[45]\d{3}|-)\]?: (.*)$/;

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

function isLogType(value: unknown): value is LogType {
  return typeof value === "string" && (LOG_TYPES as readonly string[]).includes(value);
}

function fromJson(line: string): LogRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const id: unknown = Reflect.get(parsed, "id");
  const timestamp: unknown = Reflect.get(parsed, "timestamp");
  const severity: unknown = Reflect.get(parsed, "severity");
  const type: unknown = Reflect.get(parsed, "type");
  const code: unknown = Reflect.get(parsed, "code");
  const message: unknown = Reflect.get(parsed, "message");
  if (
    typeof id !== "string" ||
    typeof timestamp !== "string" ||
    !isSeverity(severity) ||
    !isLogType(type) ||
    (code !== null && typeof code !== "string") ||
    typeof message !== "string"
  ) {
    return null;
  }
  return { id, timestamp, severity, type, code, message };
}

function fromRendered(line: string): LogRecord | null {
  const match = RENDERED.exec(line);
  if (match === null) {
    return null;
  }
  const [, timestamp, severity, type, id, code, message] = match;
  if (
    timestamp === undefined ||
    !isSeverity(severity) ||
    !isLogType(type) ||
    id === undefined ||
    code === undefined ||
    message === undefined
  ) {
    return null;
  }
  return { id, timestamp, severity, type, code: code === "-" ? null : code, message };
}

/** The records among the lines, in their order. */
export function parseLogRecords(lines: readonly string[]): LogRecord[] {
  const records: LogRecord[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    const record = fromJson(line) ?? fromRendered(line);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

/** True when the message carries the logfmt pair `key=value` (`log-record.md`, **Structured tail**). */
export function hasTailPair(message: string, key: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^| )${key}=(?:${escaped}|"${escaped}")(?: |$)`).test(message);
}

/** A short form of the records for a failure message. */
export function describeRecords(records: readonly LogRecord[]): string {
  if (records.length === 0) {
    return "(no log record on stdout)";
  }
  return records.map((record) => `${record.severity} ${record.type} ${record.code ?? "-"}: ${record.message}`).join("\n");
}
