/**
 * Starts the production build with `next start` on a free port, with exactly
 * the environment a test gives (FND-03, FND-04, FND-07, FND-08).
 *
 * Build first: `pnpm run build`.
 *
 * - The child receives the given settings and a few operating system
 *   variables (the search path and the temporary directories), never the
 *   rest of the shell's environment. A setting that a test leaves out is
 *   therefore not set in the app.
 * - `next start` reads `.env` files from the repository for each variable
 *   that is not set. The helper sets `__NEXT_PROCESSED_ENV`, which tells Next.js
 *   that the environment is already loaded, so a developer's `.env` cannot
 *   give the app a setting the test left out, or the development database.
 *   (`@next/env` 16.4 skips the env files when this variable is set, and
 *   `next start` does not force a reload.)
 * - Readiness of the port is checked with a TCP connection, not with an HTTP
 *   request, so the first request a test sends is the first one the app gets.
 */
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

import { type LogRecord, parseLogRecords } from "./log-records";
import { repositoryRoot } from "./paths";
import { freePort, waitForPort } from "./ports";

/** The operating system variables a Node.js process needs on Windows and on Linux. */
const SYSTEM_VARIABLES: readonly string[] = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "ComSpec",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "HOMEDRIVE",
  "HOMEPATH",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
  "LANG",
];

export interface SpawnedApp {
  /** For example `http://127.0.0.1:41234`. */
  readonly baseUrl: string;
  readonly port: number;
  /** The lines the app wrote to stdout so far. */
  stdout(): readonly string[];
  /** The lines the app wrote to stderr so far. */
  stderr(): readonly string[];
  /** The log records among the stdout lines (DEC-127). */
  records(): readonly LogRecord[];
  /** Stops the app and waits for the process to end. */
  stop(): Promise<void>;
}

export interface SpawnOptions {
  /** The settings of the app. The helper adds `PORT` and nothing else. */
  readonly env: Readonly<Record<string, string>>;
  /** The port to listen on. Default: a free port. */
  readonly port?: number;
  /** How long to wait for the port. Default: 60 s. */
  readonly startTimeoutMs?: number;
}

function systemEnvironment(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of SYSTEM_VARIABLES) {
    const value = process.env[name];
    if (value !== undefined) {
      result[name] = value;
    }
  }
  return result;
}

function lineCollector(target: string[]): (chunk: Buffer) => void {
  let rest = "";
  return (chunk: Buffer) => {
    const text = rest + chunk.toString("utf8");
    const lines = text.split(/\r?\n/);
    rest = lines.pop() ?? "";
    target.push(...lines);
  };
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}

/** Starts `next start` and resolves when its port accepts a connection. */
export async function spawnApp(options: SpawnOptions): Promise<SpawnedApp> {
  const port = options.port ?? (await freePort());
  const nextBin = path.join(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
  const out: string[] = [];
  const err: string[] = [];

  const child = spawn(process.execPath, [nextBin, "start", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: repositoryRoot,
    env: {
      ...systemEnvironment(),
      ...options.env,
      PORT: String(port),
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      __NEXT_PROCESSED_ENV: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.on("data", lineCollector(out));
  child.stderr?.on("data", lineCollector(err));

  const app: SpawnedApp = {
    baseUrl: `http://127.0.0.1:${String(port)}`,
    port,
    stdout: () => out,
    stderr: () => err,
    records: () => parseLogRecords(out),
    stop: async () => await stopProcess(child),
  };

  try {
    await waitForPort(port, {
      timeoutMs: options.startTimeoutMs ?? 60_000,
      isAlive: () => child.exitCode === null && child.signalCode === null,
    });
  } catch (error) {
    await app.stop();
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `next start did not listen (was "pnpm run build" run?). ${reason}\n` +
        `stderr:\n${err.slice(-20).join("\n")}`,
    );
  }

  return app;
}

/**
 * Resolves when the predicate holds for the records, or rejects after the
 * timeout. The logger writes without blocking, so a record can arrive after
 * the answer.
 */
export async function waitForRecord(
  app: SpawnedApp,
  predicate: (record: LogRecord) => boolean,
  timeoutMs = 10_000,
): Promise<LogRecord | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = app.records().find(predicate);
    if (found !== undefined || Date.now() > deadline) {
      return found;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}
