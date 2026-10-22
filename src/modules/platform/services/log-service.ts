/**
 * `GET /api/admin/logs`: the logs of this app (FND-04 rule 3, DEC-127).
 *
 * The records come from the local store `platform_log_record`. The wrapper of
 * the route has already checked that the caller is an operator.
 */
import "server-only";

import { type OperatorPrincipal, requireOperator } from "@/lib/auth";
import type { ErrorCode } from "@/lib/errors";
import { type LogType, type Severity, findLogRecords, logger } from "@/lib/logging";

import { type LogQuery, parseLogQuery } from "./log-query";

/** A record as the endpoint returns it: the six fields of `log-record.md`. */
export interface LogRecordView {
  readonly id: string;
  readonly timestamp: string;
  readonly severity: Severity;
  readonly type: LogType;
  readonly code: string | null;
  readonly message: string;
}

export interface LogPageView {
  readonly page: number;
  readonly count: number;
  readonly totalCount: number;
  readonly logs: readonly LogRecordView[];
  readonly filterParams: {
    readonly id: string | null;
    readonly severity: Severity | null;
    readonly type: LogType | null;
    readonly code: ErrorCode | null;
    readonly startDate: string;
    readonly endDate: string;
    readonly page: number;
    readonly limit: number;
  };
}

/**
 * One page of the logs, newest first.
 *
 * @param principal The operator who asks. The service reads every record, so it
 * takes the caller that the route authenticated, and no other caller can ask.
 * @param params The query string of the request.
 * @param now The clock.
 * @throws AppError `VAL-4002` to `VAL-4006` for a bad query; `DB-5000` or
 * `DB-5500` when the store does not answer.
 */
export async function listLogs(
  principal: OperatorPrincipal,
  params: URLSearchParams,
  now: Date = new Date(),
): Promise<LogPageView> {
  requireOperator(principal);
  const query: LogQuery = parseLogQuery(params, now);

  // A record written in this process a moment ago is visible to this read.
  await logger.flush();
  const page = await findLogRecords({
    startDate: query.startDate.toISOString(),
    endDate: query.endDate.toISOString(),
    severity: query.severity,
    type: query.type,
    softwareId: query.softwareId,
    code: query.code,
    page: query.page,
    limit: query.limit,
  });
  return {
    page: query.page,
    count: page.records.length,
    totalCount: page.totalCount,
    logs: page.records.map((record) => ({
      id: record.softwareId,
      timestamp: record.timestamp,
      severity: record.severity,
      type: record.type,
      code: record.code,
      message: record.message,
    })),
    filterParams: {
      id: query.softwareId,
      severity: query.severity,
      type: query.type,
      code: query.code,
      startDate: query.startDate.toISOString(),
      endDate: query.endDate.toISOString(),
      page: query.page,
      limit: query.limit,
    },
  };
}
