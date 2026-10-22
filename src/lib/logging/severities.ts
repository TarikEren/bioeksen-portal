/**
 * The closed sets of `log-record.md`: severities and types. They are plain
 * constants, so the configuration module can read them without a cycle.
 */

export const SEVERITIES = ["DEBUG", "INFO", "WARNING", "ERROR", "FATAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const LOG_TYPES = ["APP", "SECURITY", "AUDIT", "ACCESS", "JOB"] as const;
export type LogType = (typeof LOG_TYPES)[number];
