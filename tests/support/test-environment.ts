/**
 * The values of the test environment, in one place (FND-03 rule 2, `sds-auth`
 * `credentials.md` **Configuration**).
 *
 * The integration setup, the spawned apps and the token helper read the same
 * constants, so a token that a test mints always matches the settings that the
 * app under test reads. Every value here is a test value. None is a secret of a
 * real deployment.
 */
import { randomBytes } from "node:crypto";

/** The software id of the app (DEC-021, `.bioeksen/software-id`). */
export const SOFTWARE_ID = "bioeksen-portal";

/** The Entra tenant of the test issuer. */
export const TEST_TENANT_ID = "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5";

/** The exact `iss` value that the app compares (`ENTRA_ISSUER`). */
export const TEST_ISSUER = `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`;

/** The Application ID URI of the app, the value `aud` must equal (`ENTRA_AUDIENCE`). */
export const TEST_AUDIENCE = `api://${SOFTWARE_ID}`;

/** The client id of the app itself (`ENTRA_CLIENT_ID`). */
export const TEST_CLIENT_ID = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";

/** The client id of the operator tool that asks for operator tokens (`azp`). */
export const TEST_OPERATOR_TOOL_CLIENT_ID = "1c2d3e4f-5061-4728-93a4-b5c6d7e8f901";

/** The client id of another app that calls with an app-only token (`azp`). */
export const TEST_OTHER_APP_CLIENT_ID = "2d3e4f50-6172-4839-a4b5-c6d7e8f90112";

/** The `scp` value that marks a delegated token as an operator token (`ENTRA_OPERATOR_SCOPE`). */
export const TEST_OPERATOR_SCOPE = "Operator.Access";

/** The clock skew allowance of `sds-auth`, 60 seconds (`AUTH_CLOCK_SKEW_SECONDS`). */
export const TEST_CLOCK_SKEW_SECONDS = 60;

/** The JWKS path of the local issuer, as Entra publishes it. */
export const JWKS_PATH = `/${TEST_TENANT_ID}/discovery/v2.0/keys`;

/** A Redis for the tiers that need one. `TEST_REDIS_URL` overrides the local default. */
export function testRedisUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env["TEST_REDIS_URL"];
  return configured === undefined || configured.trim() === "" ? "redis://127.0.0.1:6379" : configured.trim();
}

/** A key ring value of IFU-90 (`id:base64key`), with one random AES-256 key. */
export function testIdentityKeys(): string {
  return `qa2026:${randomBytes(32).toString("base64")}`;
}

/** The settings of FND-03 rule 2. */
export type AppEnvironment = Record<string, string>;

export interface AppEnvironmentInput {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwksUri: string;
  readonly publicBaseUrl: string;
  readonly s3EndpointUrl?: string;
  readonly smtpHost?: string;
  readonly smtpPort?: string;
}

/**
 * Every required setting of FND-03 rule 2 with a usable test value, for
 * `APP_ENV` `test` with the test seams on (FND-03 rule 4).
 *
 * A test removes or changes one setting to prove one rule. The caller gives
 * the values that point to services: the database, the cache, the JWKS URI and
 * the public base URL.
 */
export function appEnvironment(input: AppEnvironmentInput): AppEnvironment {
  return {
    APP_ENV: "test",
    TEST_SEAMS_ENABLED: "true",
    DATABASE_URL: input.databaseUrl,
    REDIS_URL: input.redisUrl,
    S3_ENDPOINT_URL: input.s3EndpointUrl ?? "http://127.0.0.1:9000",
    S3_REGION: "eu-central-1",
    S3_BUCKET: "bioeksen-portal-qa",
    S3_ACCESS_KEY_ID: "qa-access-key",
    S3_SECRET_ACCESS_KEY: "qa-secret-access-key-not-real",
    SMTP_HOST: input.smtpHost ?? "127.0.0.1",
    SMTP_PORT: input.smtpPort ?? "1025",
    SMTP_USER: "qa",
    SMTP_PASSWORD: "qa-smtp-password-not-real",
    MAIL_FROM: "portal-qa@example.invalid",
    PUBLIC_BASE_URL: input.publicBaseUrl,
    EIFU_LEGAL_NOTICE_VERSION: "qa-1",
    ENTRA_TENANT_ID: TEST_TENANT_ID,
    ENTRA_ISSUER: TEST_ISSUER,
    ENTRA_JWKS_URI: input.jwksUri,
    ENTRA_JWKS_MAX_AGE_SECONDS: "3600",
    ENTRA_AUDIENCE: TEST_AUDIENCE,
    ENTRA_CLIENT_ID: TEST_CLIENT_ID,
    ENTRA_CLIENT_SECRET: "qa-client-secret-not-real",
    ENTRA_OPERATOR_SCOPE: TEST_OPERATOR_SCOPE,
    AUTH_CLOCK_SKEW_SECONDS: String(TEST_CLOCK_SKEW_SECONDS),
  };
}

/**
 * The settings that `APP_ENV` `production` adds (FND-03 rule 2), with the
 * test seams off (FND-03 rule 4).
 */
export function productionEnvironment(input: AppEnvironmentInput): AppEnvironment {
  return {
    ...appEnvironment(input),
    APP_ENV: "production",
    TEST_SEAMS_ENABLED: "false",
    TRUSTED_PROXIES: "127.0.0.1",
    EIFU_IDENTITY_KEYS: testIdentityKeys(),
    EIFU_IDENTITY_LOOKUP_PEPPER: randomBytes(24).toString("base64url"),
  };
}

/** The names of the `ENTRA_*` settings in the environment (`sds-auth`, `credentials.md`, **Configuration**). */
export function entraSettingNames(environment: AppEnvironment): string[] {
  return Object.keys(environment).filter((name) => name.startsWith("ENTRA_"));
}

/**
 * The settings of the demo (DEC-135): `APP_ENV` `demo`, every other setting
 * of `productionEnvironment` (each other rule of `production` also applies),
 * and no `ENTRA_*` setting. The test seams are off.
 */
export function demoEnvironment(input: Omit<AppEnvironmentInput, "jwksUri">): AppEnvironment {
  // productionEnvironment needs a JWKS URI; the demo has none, so the value is removed with the other ENTRA_* settings.
  const production = productionEnvironment({ ...input, jwksUri: "" });
  return { ...without(production, ...entraSettingNames(production)), APP_ENV: "demo" };
}

/** Returns a copy of the environment without the named settings. */
export function without(environment: AppEnvironment, ...names: readonly string[]): AppEnvironment {
  const copy: AppEnvironment = { ...environment };
  for (const name of names) {
    delete copy[name];
  }
  return copy;
}
