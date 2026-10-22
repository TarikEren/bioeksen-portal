/**
 * The schema of the configuration (FND-03 rule 2, `sds-config`).
 *
 * It lists every setting of the app with its type, its default and whether it
 * is required. The type `Config` comes from it (`z.infer`), and nothing else
 * declares a setting.
 *
 * The rules that join several settings are in `crossChecks`. A zod object
 * check does not run when a field already failed, and the operator needs every
 * failure of one start in one pass.
 *
 * The defaults that the specs give: `S3_PUBLIC_ENDPOINT_URL` is the value of
 * `S3_ENDPOINT_URL` (DEC-132), the retention is 3653 days (DEC-080),
 * `LOG_LEVEL` is `INFO`, `TEST_SEAMS_ENABLED` is `false`, the clock skew is 60
 * seconds (`sds-auth`).
 */
import { isIP } from "node:net";

import { z } from "zod";

import { SEVERITIES } from "@/lib/logging/severities";

const nonEmpty = z.string().min(1);

/** `"true"` and `"false"` only. Any other text is an unusable value. */
const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

/** One IP address, or one network as `address/prefix`. */
function isProxyAddress(value: string): boolean {
  const [address, prefix, ...rest] = value.split("/");
  if (address === undefined || rest.length > 0) {
    return false;
  }
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  const limit = family === 4 ? 32 : 128;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= limit;
}

/** The proxy addresses of DEC-038, comma separated. The result is the list. */
const proxyList = nonEmpty
  .refine((value) => value.split(",").every((entry) => isProxyAddress(entry.trim())))
  .transform((value) => value.split(",").map((entry) => entry.trim()));

export const configSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  S3_ENDPOINT_URL: z.url(),
  S3_PUBLIC_ENDPOINT_URL: z.url().optional(),
  S3_REGION: nonEmpty,
  S3_BUCKET: nonEmpty,
  S3_ACCESS_KEY_ID: nonEmpty,
  S3_SECRET_ACCESS_KEY: nonEmpty,

  SMTP_HOST: nonEmpty,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_USER: nonEmpty,
  SMTP_PASSWORD: nonEmpty,
  MAIL_FROM: nonEmpty,

  PUBLIC_BASE_URL: z.url(),
  TRUSTED_PROXIES: proxyList.optional(),

  EIFU_LEGAL_NOTICE_VERSION: nonEmpty,
  EIFU_IDENTITY_KEYS: nonEmpty.optional(),
  EIFU_IDENTITY_LOOKUP_PEPPER: nonEmpty.optional(),
  EIFU_ACCESS_RECORD_RETENTION_DAYS: z.coerce.number().int().min(0).default(3653),

  ENTRA_TENANT_ID: nonEmpty,
  ENTRA_ISSUER: nonEmpty,
  ENTRA_JWKS_URI: z.url(),
  ENTRA_JWKS_MAX_AGE_SECONDS: z.coerce.number().int().min(1),
  ENTRA_AUDIENCE: nonEmpty,
  ENTRA_CLIENT_ID: nonEmpty,
  ENTRA_CLIENT_CERTIFICATE_PATH: nonEmpty.optional(),
  ENTRA_CLIENT_SECRET: nonEmpty.optional(),
  ENTRA_OPERATOR_SCOPE: nonEmpty,
  AUTH_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(0).default(60),

  LOG_LEVEL: z.enum(SEVERITIES).default("INFO"),
  TEST_SEAMS_ENABLED: booleanFlag.default(false),
  BOOTSTRAP_ADMIN_EMAIL: z.email().optional(),
});

/** The typed settings. */
export type Config = z.infer<typeof configSchema>;

/** The smallest length of `EIFU_IDENTITY_LOOKUP_PEPPER` in production (IFU-90). */
export const MIN_PEPPER_LENGTH = 32;

/** The failure of one setting. It never holds the value of the setting. */
export interface ConfigIssue {
  readonly setting: string;
  /** `CFG-5000` when the setting is not set, `CFG-5001` when the app cannot use its value. */
  readonly code: "CFG-5000" | "CFG-5001";
  /** A fixed phrase that tells the kind of fault. It is never taken from the value. */
  readonly reason: string;
}

export type ConfigEnvironment = Readonly<Record<string, string | undefined>>;

/** The phrase for each kind of zod issue. The phrase never quotes the input. */
function reasonOf(code: string): string {
  switch (code) {
    case "invalid_type":
      return "wrong type";
    case "invalid_format":
      return "wrong format";
    case "invalid_value":
      return "not an allowed value";
    case "too_small":
      return "too small or empty";
    case "too_big":
      return "too large";
    case "custom":
      return "not usable";
    default:
      return "not usable";
  }
}

/** Turns the issues of the schema into `ConfigIssue` entries, one for each setting. */
export function schemaIssues(env: ConfigEnvironment): ConfigIssue[] {
  const result = configSchema.safeParse(env);
  if (result.success) {
    return [];
  }
  const issues: ConfigIssue[] = [];
  for (const issue of result.error.issues) {
    const setting = String(issue.path[0] ?? "(environment)");
    if (issues.some((known) => known.setting === setting)) {
      continue;
    }
    const missing = env[setting] === undefined;
    issues.push(
      missing
        ? { setting, code: "CFG-5000", reason: "not set" }
        : { setting, code: "CFG-5001", reason: reasonOf(issue.code) },
    );
  }
  return issues;
}

/**
 * The rules that join several settings (FND-03 rules 2 and 4, `sds-auth`).
 * They read the raw environment, so they run even when a field failed.
 */
export function crossChecks(env: ConfigEnvironment): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const production = env["APP_ENV"] === "production";

  if (production) {
    for (const setting of ["TRUSTED_PROXIES", "EIFU_IDENTITY_KEYS", "EIFU_IDENTITY_LOOKUP_PEPPER"]) {
      if (env[setting] === undefined) {
        issues.push({ setting, code: "CFG-5000", reason: "not set (production requires it)" });
      }
    }
    const pepper = env["EIFU_IDENTITY_LOOKUP_PEPPER"];
    if (pepper !== undefined && pepper.length < MIN_PEPPER_LENGTH) {
      issues.push({
        setting: "EIFU_IDENTITY_LOOKUP_PEPPER",
        code: "CFG-5001",
        reason: `shorter than ${MIN_PEPPER_LENGTH} characters`,
      });
    }
  }

  if (production && env["TEST_SEAMS_ENABLED"] === "true") {
    issues.push({
      setting: "TEST_SEAMS_ENABLED",
      code: "CFG-5001",
      reason: "the test seams cannot be on in production",
    });
  }

  if (env["ENTRA_CLIENT_CERTIFICATE_PATH"] === undefined && env["ENTRA_CLIENT_SECRET"] === undefined) {
    issues.push({
      setting: "ENTRA_CLIENT_SECRET",
      code: "CFG-5000",
      reason: "not set (one of ENTRA_CLIENT_CERTIFICATE_PATH and ENTRA_CLIENT_SECRET is required)",
    });
  }

  return issues;
}
