/**
 * The schema of the configuration (FND-03 rule 2, `sds-config`).
 *
 * It lists every setting of the app with its type, its default and whether it
 * is required. The type `Config` comes from it (`z.infer`), and nothing else
 * declares a setting.
 *
 * Skeleton of stage B0: the fields only. These rules come with the build of
 * FND-03, and each one is a refinement that this file does not hold yet:
 * - the settings that production requires (`TRUSTED_PROXIES`,
 *   `EIFU_IDENTITY_KEYS`, `EIFU_IDENTITY_LOOKUP_PEPPER` of at least 32
 *   characters);
 * - `TEST_SEAMS_ENABLED` true with `APP_ENV` production is `CFG-5001`
 *   (FND-03 rule 4);
 * - one client credential of `sds-auth`: a certificate path or a secret;
 * - the mapping of a missing setting to `CFG-5000` and of an unusable value to
 *   `CFG-5001`.
 *
 * The defaults that the specs give: `S3_PUBLIC_ENDPOINT_URL` is the value of
 * `S3_ENDPOINT_URL` (DEC-132), the retention is 3653 days (DEC-080),
 * `LOG_LEVEL` is `INFO`, `TEST_SEAMS_ENABLED` is `false`, the clock skew is 60
 * seconds (`sds-auth`).
 */
import { z } from "zod";

import { SEVERITIES } from "@/lib/logging/severities";

const nonEmpty = z.string().min(1);

/** `"true"` and `"false"` only. Any other text is an unusable value. */
const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

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
  TRUSTED_PROXIES: z.string().optional(),

  EIFU_LEGAL_NOTICE_VERSION: nonEmpty,
  EIFU_IDENTITY_KEYS: z.string().optional(),
  EIFU_IDENTITY_LOOKUP_PEPPER: z.string().optional(),
  EIFU_ACCESS_RECORD_RETENTION_DAYS: z.coerce.number().int().min(0).default(3653),

  ENTRA_TENANT_ID: nonEmpty,
  ENTRA_ISSUER: nonEmpty,
  ENTRA_JWKS_URI: z.url(),
  ENTRA_JWKS_MAX_AGE_SECONDS: z.coerce.number().int().min(1),
  ENTRA_AUDIENCE: nonEmpty,
  ENTRA_CLIENT_ID: nonEmpty,
  ENTRA_CLIENT_CERTIFICATE_PATH: z.string().optional(),
  ENTRA_CLIENT_SECRET: z.string().optional(),
  ENTRA_OPERATOR_SCOPE: nonEmpty,
  AUTH_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(0).default(60),

  LOG_LEVEL: z.enum(SEVERITIES).default("INFO"),
  TEST_SEAMS_ENABLED: booleanFlag.default(false),
  BOOTSTRAP_ADMIN_EMAIL: z.email().optional(),
});

/** The typed settings. */
export type Config = z.infer<typeof configSchema>;
