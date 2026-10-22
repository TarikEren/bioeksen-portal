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
