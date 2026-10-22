/**
 * The query string of `GET /api/admin/logs` (`standard-api-endpoints.md`,
 * **Query parameters**).
 *
 * An unknown query parameter is ignored. A fault of a known parameter is 400,
 * and the code is the first condition of the selection procedure over every
 * fault (`code-prefixes.md`):
 *
 * | Step | Fault | Code |
 * |---|---|---|
 * | 15 | `severity`, `type` or `code` outside its enumeration | `VAL-4002` |
 * | 16 | a date, `page` or `limit` that does not parse | `VAL-4003` |
 * | 17 | `endDate` earlier than `startDate` | `VAL-4004` |
 * | 18 | `page` below 1, `limit` outside 1 to 200 | `VAL-4005` |
 * | 19 | `id` of a wrong form | `VAL-4006` |
 *
 * This file is pure.
 */
import { z } from "zod";

import { AppError, CODE_MEANINGS, ERROR_CODES, type ErrorCode, type FieldIssue } from "@/lib/errors";
import { LOG_TYPES, SEVERITIES, type LogType, type Severity } from "@/lib/logging/severities";

/** The records that the app keeps at least, in days (`standard-api-endpoints.md`, **Retention**). */
export const LOG_RETENTION_DAYS = 7;

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

type QueryFaultCode = "VAL-4002" | "VAL-4003" | "VAL-4004" | "VAL-4005" | "VAL-4006";

/** The order of the selection procedure. The lowest index wins. */
const PRECEDENCE: readonly QueryFaultCode[] = ["VAL-4002", "VAL-4003", "VAL-4004", "VAL-4005", "VAL-4006"];

interface QueryFault {
  readonly code: QueryFaultCode;
  readonly entry: FieldIssue;
}

export interface LogQuery {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly severity: Severity | null;
  readonly type: LogType | null;
  readonly softwareId: string | null;
  readonly code: ErrorCode | null;
  readonly page: number;
  readonly limit: number;
}

const instantSchema = z.iso.datetime({ offset: true });
const softwareIdSchema = z.string().min(1).max(63).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/**
 * Reads and checks the query string.
 *
 * @param now The clock. The default `endDate` and the start of the window come from it.
 * @throws AppError `VAL-4002` to `VAL-4006` with every fault in `details`.
 */
export function parseLogQuery(params: URLSearchParams, now: Date): LogQuery {
  const faults: QueryFault[] = [];
  const fault = (code: QueryFaultCode, field: string, issue: string): void => {
    faults.push({ code, entry: { field, issue } });
  };

  const enumeration = <TValue extends string>(name: string, values: readonly TValue[]): TValue | null => {
    const raw = params.get(name);
    if (raw === null) {
      return null;
    }
    const found = values.find((value) => value === raw);
    if (found === undefined) {
      fault("VAL-4002", name, "is not one of the allowed values");
      return null;
    }
    return found;
  };

  const instant = (name: string): Date | null => {
    const raw = params.get(name);
    if (raw === null) {
      return null;
    }
    if (!instantSchema.safeParse(raw).success) {
      fault("VAL-4003", name, "is not an RFC 3339 date and time with an offset");
      return null;
    }
    return new Date(raw);
  };

  const integer = (name: string, fallback: number): number => {
    const raw = params.get(name);
    if (raw === null) {
      return fallback;
    }
    const value = /^-?\d{1,15}$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(value)) {
      fault("VAL-4003", name, "is not an integer");
      return fallback;
    }
    return value;
  };

  const severity = enumeration("severity", SEVERITIES);
  const type = enumeration("type", LOG_TYPES);
  const code = enumeration("code", ERROR_CODES);

  const rawId = params.get("id");
  let softwareId: string | null = null;
  if (rawId !== null) {
    if (softwareIdSchema.safeParse(rawId).success) {
      softwareId = rawId;
    } else {
      fault("VAL-4006", "id", "is not a software id");
    }
  }

  const startDate = instant("startDate");
  const endDate = instant("endDate");
  if (startDate !== null && endDate !== null && endDate.getTime() < startDate.getTime()) {
    fault("VAL-4004", "endDate", "must be at or after startDate");
  }

  const page = integer("page", DEFAULT_PAGE);
  if (page < 1) {
    fault("VAL-4005", "page", "must be 1 or more");
  }
  const limit = integer("limit", DEFAULT_LIMIT);
  if (limit < 1 || limit > MAX_LIMIT) {
    fault("VAL-4005", "limit", `must be from 1 to ${String(MAX_LIMIT)}`);
  }

  const first = PRECEDENCE.find((candidate) => faults.some((known) => known.code === candidate));
  if (first !== undefined) {
    throw new AppError(first, CODE_MEANINGS[first], { details: faults.map((known) => known.entry) });
  }

  // A `startDate` before the window is clamped, never refused (**Retention**).
  const windowStart = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const requestedStart = startDate ?? windowStart;
  return {
    startDate: requestedStart.getTime() < windowStart.getTime() ? windowStart : requestedStart,
    endDate: endDate ?? now,
    severity,
    type,
    softwareId,
    code,
    page,
    limit,
  };
}
