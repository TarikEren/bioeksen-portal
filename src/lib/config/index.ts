/**
 * The configuration module (FND-03, `sds-config`): the one place that reads
 * `process.env`, once. It checks the values with `configSchema` and exports
 * typed values. No other file reads `process.env`.
 *
 * The process checks the settings when it starts, in `src/instrumentation.ts`,
 * and not at build time, where the values are absent (`sds-config`, **When it
 * is validated**). A failure never ends the process: the app stays up, answers
 * `GET /api/health/ready` with 503, and writes one `FATAL` record for each
 * failed setting. A failure names the setting and never its value.
 */
import "server-only";

import { AppError } from "@/lib/errors";
import { SEVERITIES, type Severity } from "@/lib/logging/severities";

import {
  type Config,
  type ConfigEnvironment,
  type ConfigIssue,
  configSchema,
  crossChecks,
  schemaIssues,
} from "./schema";
import { readSoftwareId } from "./software-id";

export { readSoftwareId } from "./software-id";
export { configSchema } from "./schema";
export type { Config, ConfigIssue } from "./schema";

/** The failure of the configuration. `code` is the code of the first failed setting. */
export class ConfigError extends AppError {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const first = issues[0];
    super(first?.code ?? "CFG-5001", `Configuration unusable: ${issues.map((issue) => issue.setting).join(", ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export type ConfigState =
  | { readonly status: "ready"; readonly config: Config }
  | { readonly status: "failed"; readonly issues: readonly ConfigIssue[] };

/** Every failed setting of `env`, once for each setting. Empty when the environment is usable. */
export function inspectConfig(env: ConfigEnvironment): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  for (const issue of [...schemaIssues(env), ...crossChecks(env)]) {
    if (!issues.some((known) => known.setting === issue.setting)) {
      issues.push(issue);
    }
  }
  return issues;
}

/**
 * Checks `env` against the schema.
 *
 * @throws ConfigError `CFG-5000` when a required setting is not set, and
 * `CFG-5001` when the app cannot use a value. The error names the setting and
 * never its value.
 */
export function loadConfig(env: ConfigEnvironment): Config {
  const issues = inspectConfig(env);
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
  return configSchema.parse(env);
}

/** The state of the configuration, from `env`. */
export function evaluateConfig(env: ConfigEnvironment): ConfigState {
  const issues = inspectConfig(env);
  return issues.length > 0 ? { status: "failed", issues } : { status: "ready", config: configSchema.parse(env) };
}

let snapshot: ConfigEnvironment | undefined;
let state: ConfigState | undefined;

/** The environment of the process: the one read of `process.env`, at the first call. */
function environment(): ConfigEnvironment {
  snapshot ??= { ...process.env };
  return snapshot;
}

/**
 * The state of the configuration of the process. The first call reads
 * `process.env`. The result stays the same for the life of the process.
 */
export function getConfigState(): ConfigState {
  state ??= withSoftwareId(evaluateConfig(environment()));
  return state;
}

/** The setting that names the file of the software id in a failure. */
export const SOFTWARE_ID_SETTING = ".bioeksen/software-id";

/**
 * Adds the software id to the state. An app with no id cannot write a log
 * record, so it does not report ready (`sds-config`: validate before ready).
 */
export function withSoftwareId(current: ConfigState, startDirectory?: string): ConfigState {
  try {
    readSoftwareId(startDirectory);
    return current;
  } catch (error) {
    const issue: ConfigIssue =
      error instanceof AppError && error.code === "CFG-5001"
        ? { setting: SOFTWARE_ID_SETTING, code: "CFG-5001", reason: "the form is not allowed" }
        : { setting: SOFTWARE_ID_SETTING, code: "CFG-5000", reason: "not supplied" };
    return { status: "failed", issues: [...(current.status === "failed" ? current.issues : []), issue] };
  }
}

/**
 * The configuration of the process.
 *
 * @throws ConfigError when the configuration is not usable.
 */
export function getConfig(): Config {
  const current = getConfigState();
  if (current.status === "failed") {
    throw new ConfigError(current.issues);
  }
  return current.config;
}

/** The identity provider that the app verifies tokens against (`sds-auth`). */
export interface IdentityProvider {
  readonly tenantId: string;
  readonly issuer: string;
  readonly jwksUri: string;
  readonly jwksMaxAgeSeconds: number;
  readonly audience: string;
  readonly operatorScope: string;
  readonly clockSkewSeconds: number;
}

/**
 * The identity provider of `config`, or `null` when it has none. Only the demo
 * can have none: every other `APP_ENV` fails the configuration check when an
 * identity setting is missing (DEC-135, FND-03 rule 2).
 */
export function identityProviderOf(config: Config): IdentityProvider | null {
  const {
    ENTRA_TENANT_ID: tenantId,
    ENTRA_ISSUER: issuer,
    ENTRA_JWKS_URI: jwksUri,
    ENTRA_JWKS_MAX_AGE_SECONDS: jwksMaxAgeSeconds,
    ENTRA_AUDIENCE: audience,
    ENTRA_OPERATOR_SCOPE: operatorScope,
    AUTH_CLOCK_SKEW_SECONDS: clockSkewSeconds,
  } = config;
  if (
    tenantId === undefined ||
    issuer === undefined ||
    jwksUri === undefined ||
    jwksMaxAgeSeconds === undefined ||
    audience === undefined ||
    operatorScope === undefined
  ) {
    return null;
  }
  return { tenantId, issuer, jwksUri, jwksMaxAgeSeconds, audience, operatorScope, clockSkewSeconds };
}

/**
 * The identity provider of the process, or `null` in a demo that has none.
 *
 * @throws ConfigError when the configuration is not usable.
 */
export function getIdentityProvider(): IdentityProvider | null {
  return identityProviderOf(getConfig());
}

/**
 * Whether the test seams work (FND-03 rule 4). Both conditions must hold:
 * `TEST_SEAMS_ENABLED` is `true` and `APP_ENV` is `development` or `test`, so
 * `demo` and `production` keep them closed. The answer does not depend on the
 * other settings, so a seam is also closed in an app whose configuration failed.
 * A missing or unknown `APP_ENV` closes it.
 */
export function isTestSeamEnabled(): boolean {
  const env = environment();
  const appEnvironment = env["APP_ENV"];
  return env["TEST_SEAMS_ENABLED"] === "true" && (appEnvironment === "development" || appEnvironment === "test");
}

/**
 * The lowest severity the logger writes (`LOG_LEVEL`). The logger asks for it
 * also when the rest of the configuration failed, so a bad value falls back to
 * `INFO` here and fails in `inspectConfig`.
 */
export function getLogLevel(): Severity {
  const value = environment()["LOG_LEVEL"];
  return SEVERITIES.find((severity) => severity === value) ?? "INFO";
}

/**
 * Whether this build is the development server (`next dev`). The Content
 * Security Policy allows what only the development server needs (FND-07 rule 1).
 *
 * The test is the literal `process.env.NODE_ENV`, which `next dev` and
 * `next build` replace in the code when they compile it. A production build
 * holds the text `"production"` there, so a value of `NODE_ENV` that is set when
 * `next start` runs cannot add `'unsafe-eval'`. `APP_ENV` has no part in this.
 */
export function isDevelopmentServer(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Whether the public address of the app is HTTPS (`PUBLIC_BASE_URL`). A cookie
 * carries `Secure` only then, so a developer on `http://localhost` still gets
 * it. The answer does not depend on the other settings.
 */
export function isPublicBaseUrlSecure(): boolean {
  return environment()["PUBLIC_BASE_URL"]?.startsWith("https://") === true;
}
