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
  state ??= evaluateConfig(environment());
  return state;
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

/**
 * Whether the test seams work (FND-03 rule 4). Both conditions must hold:
 * `TEST_SEAMS_ENABLED` is `true` and `APP_ENV` is a non-production value. The
 * answer does not depend on the other settings, so a seam is also closed in an
 * app whose configuration failed. A missing or unknown `APP_ENV` closes it.
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
 * Whether this process is the development server (`next dev`, which sets
 * `NODE_ENV` to `development`). The Content Security Policy allows what only the
 * development server needs (FND-07 rule 1). `APP_ENV` has no part in this: a
 * production build started with `APP_ENV=development` is not a development
 * server.
 */
export function isDevelopmentServer(): boolean {
  return environment()["NODE_ENV"] === "development";
}

/**
 * Whether the public address of the app is HTTPS (`PUBLIC_BASE_URL`). A cookie
 * carries `Secure` only then, so a developer on `http://localhost` still gets
 * it. The answer does not depend on the other settings.
 */
export function isPublicBaseUrlSecure(): boolean {
  return environment()["PUBLIC_BASE_URL"]?.startsWith("https://") === true;
}
