/**
 * The error codes of the `bioeksen-sds` registry, and their HTTP status.
 *
 * Implements DEC-013 (a failure carries only a code of the registry) and
 * FND-05 rule 2. The list is closed: it copies `ErrorCode` of
 * `sds-api-design/references/openapi.yaml`, which copies `code-prefixes.md`.
 * Nobody adds a code here. A human adds it to the registry first.
 *
 * The status comes from the range of the number, as `error-codes.md` says
 * (**HTTP mapping**). It is never stored beside the code.
 */

export const ERROR_CODES = [
  "AUTH-4100",
  "AUTH-4101",
  "AUTH-4102",
  "AUTH-4103",
  "AUTH-5500",
  "PERM-4150",
  "PERM-4151",
  "PERM-4152",
  "VAL-4000",
  "VAL-4001",
  "VAL-4002",
  "VAL-4003",
  "VAL-4004",
  "VAL-4005",
  "VAL-4006",
  "VAL-4007",
  "VAL-4550",
  "VAL-4600",
  "RES-4200",
  "RES-4300",
  "RES-4301",
  "RES-4302",
  "RES-4500",
  "RATE-4400",
  "DB-5000",
  "DB-5001",
  "DB-5002",
  "DB-5500",
  "DB-5501",
  "CACHE-5000",
  "CACHE-5500",
  "UP-5000",
  "UP-5500",
  "UP-5501",
  "CFG-5000",
  "CFG-5001",
  "JOB-4000",
  "JOB-5000",
  "JOB-5001",
  "LOG-4000",
  "LOG-5000",
  "LOG-5500",
  "SYS-5000",
  "SYS-5500",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The Meaning text of each code in `code-prefixes.md`. The prose of a log
 * record is this text with its first character lowercased (**Message prose**).
 */
export const CODE_MEANINGS: Readonly<Record<ErrorCode, string>> = {
  "AUTH-4100": "Credential missing",
  "AUTH-4101": "Credential invalid",
  "AUTH-4102": "Credential expired",
  "AUTH-4103": "Credential malformed",
  "AUTH-5500": "Identity provider unavailable",
  "PERM-4150": "Not permitted",
  "PERM-4151": "Operator role required",
  "PERM-4152": "Resource belongs to another principal",
  "VAL-4000": "Request body malformed",
  "VAL-4001": "Required field missing",
  "VAL-4002": "Unknown value for an enumerated field",
  "VAL-4003": "Query parameter malformed",
  "VAL-4004": "endDate earlier than startDate",
  "VAL-4005": "Pagination out of range",
  "VAL-4006": "Field value invalid",
  "VAL-4007": "Unknown field",
  "VAL-4550": "Request body too large",
  "VAL-4600": "Unsupported media type",
  "RES-4200": "Resource does not exist",
  "RES-4300": "Resource already exists",
  "RES-4301": "Conflicting concurrent update",
  "RES-4302": "Operation not allowed in current state",
  "RES-4500": "Method not allowed",
  "RATE-4400": "Rate limit exceeded",
  "DB-5000": "Query failed",
  "DB-5001": "Write failed",
  "DB-5002": "Transaction rolled back",
  "DB-5500": "Database unavailable",
  "DB-5501": "Connection pool exhausted",
  "CACHE-5000": "Cache operation failed",
  "CACHE-5500": "Cache unavailable",
  "UP-5000": "Upstream response unusable",
  "UP-5500": "Upstream unavailable",
  "UP-5501": "Upstream timed out",
  "CFG-5000": "Required configuration missing",
  "CFG-5001": "Configuration value invalid",
  "JOB-4000": "Job parameters invalid",
  "JOB-5000": "Job failed",
  "JOB-5001": "Job timed out",
  "LOG-4000": "Log record malformed",
  "LOG-5000": "Log submission rejected",
  "LOG-5500": "Log aggregator unavailable",
  "SYS-5000": "Unhandled error",
  "SYS-5500": "Not ready",
};

/** The HTTP status of each range of code numbers (`error-codes.md`). */
const STATUS_RANGES: readonly (readonly [first: number, last: number, status: number])[] = [
  [4000, 4099, 400],
  [4100, 4149, 401],
  [4150, 4199, 403],
  [4200, 4299, 404],
  [4300, 4399, 409],
  [4400, 4499, 429],
  [4500, 4549, 405],
  [4550, 4599, 413],
  [4600, 4649, 415],
  [5000, 5499, 500],
  [5500, 5999, 503],
];

/**
 * Returns the HTTP status of a code.
 *
 * @throws Error when a code of the registry falls in no range. The registry
 * and the range table then disagree, which is a defect of this file.
 */
export function httpStatusOf(code: ErrorCode): number {
  const number = Number(code.slice(code.indexOf("-") + 1));
  const range = STATUS_RANGES.find(([first, last]) => number >= first && number <= last);
  if (range === undefined) {
    throw new Error(`The registry code ${code} has no HTTP status range.`);
  }
  return range[2];
}
