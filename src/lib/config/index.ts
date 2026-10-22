/**
 * The configuration module (FND-03, `sds-config`): the one place that reads
 * `process.env`, once, at start. It checks the values with `configSchema` and
 * exports typed values. No other file reads `process.env`.
 *
 * Skeleton of stage B0: the names and the signatures. Every body throws
 * `NotImplemented`. The build validates at the start of the process, in
 * `src/instrumentation.ts`, and not at build time, where the values are absent
 * (`sds-config`, **When it is validated**).
 */
import "server-only";

import { NotImplemented } from "@/lib/errors";

import type { Config } from "./schema";

export { configSchema } from "./schema";
export type { Config } from "./schema";

/**
 * Checks `env` against the schema.
 *
 * @throws AppError `CFG-5000` when a required setting is not set.
 * @throws AppError `CFG-5001` when the app cannot use a value. The error names
 * the setting and never its value.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  void env;
  throw new NotImplemented("loadConfig");
}

/** The configuration of the process. */
export function getConfig(): Config {
  throw new NotImplemented("getConfig");
}
