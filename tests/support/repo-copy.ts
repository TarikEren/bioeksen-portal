/**
 * A clean copy of the repository in a temporary directory, for the pipeline
 * tier (FND-01, FND-02, FND-06, FND-08).
 *
 * The copy holds the files git tracks and the new files git does not ignore,
 * as they are in the working tree: what a clean checkout holds once the
 * change is committed. It never holds `.env` files, `node_modules`, `.next`
 * or test output, because `.gitignore` ignores them.
 *
 * - `linkNodeModules: false` gives a copy with no dependencies, for
 *   `pnpm install --frozen-lockfile` on a clean checkout (FND-01).
 * - `linkNodeModules: true` links the repository's `node_modules` into the
 *   copy (a junction on Windows), for a check that only reads the
 *   dependencies: lint, type check, build, the drift check. `remove()`
 *   unlinks the link first, so it never deletes the repository's own
 *   dependencies.
 *
 * A test changes the copy freely: the repository never changes.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { repositoryRoot } from "./paths";

export interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** stdout and stderr together. */
  readonly output: string;
}

export interface RunOptions {
  /** Settings added to the environment of the command. */
  readonly env?: Readonly<Record<string, string>>;
  /** Default: 10 minutes. */
  readonly timeoutMs?: number;
}

export interface RepositoryCopy {
  readonly dir: string;
  /** Runs `pnpm <args>` in the copy. */
  pnpm(args: readonly string[], options?: RunOptions): Promise<RunResult>;
  /** Runs a program in the copy. */
  run(command: string, args: readonly string[], options?: RunOptions): Promise<RunResult>;
  /** Writes a file of the copy, with its directories. */
  write(relativePath: string, content: string): void;
  /** Reads a file of the copy. */
  read(relativePath: string): string;
  /** Deletes a file of the copy. */
  delete(relativePath: string): void;
  /** Deletes the copy. */
  remove(): void;
}

/**
 * Settings of the app and of the test databases. A command in a copy never
 * receives them from the shell, so it cannot reach a database by accident.
 */
const WITHHELD = [
  /^DATABASE_URL$/,
  /^TEST_DATABASE_URL$/,
  /^TEST_E2E_DATABASE_URL$/,
  /^REDIS_URL$/,
  /^S3_/,
  /^SMTP_/,
  /^ENTRA_/,
  /^EIFU_/,
  /^APP_ENV$/,
  /^TEST_SEAMS_ENABLED$/,
  /^NODE_OPTIONS$/,
  /^VITEST/,
];

function commandEnvironment(extra: Readonly<Record<string, string>> | undefined): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(result)) {
    if (WITHHELD.some((pattern) => pattern.test(name))) {
      delete result[name];
    }
  }
  return { ...result, NEXT_TELEMETRY_DISABLED: "1", CI: "true", ...extra };
}

/** The files git would put in a clean checkout of the working tree. */
function repositoryFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr}`);
  }
  return result.stdout.split("\0").filter((file) => file !== "" && existsSync(path.join(repositoryRoot, file)));
}

/** How pnpm is started: the script of the running pnpm, or the `pnpm` command. */
function pnpmInvocation(): { command: string; prefix: string[]; shell: boolean } {
  const execPath = process.env["npm_execpath"];
  if (execPath !== undefined && /pnpm/i.test(path.basename(execPath)) && /\.(c?js|mjs)$/.test(execPath)) {
    return { command: process.execPath, prefix: [execPath], shell: false };
  }
  return { command: "pnpm", prefix: [], shell: process.platform === "win32" };
}

async function runIn(
  dir: string,
  command: string,
  args: readonly string[],
  shell: boolean,
  options: RunOptions = {},
): Promise<RunResult> {
  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: dir,
      env: commandEnvironment(options.env),
      shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      output += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} ${args.join(" ")} did not end within ${String(options.timeoutMs ?? 600_000)} ms.`));
    }, options.timeoutMs ?? 600_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, output });
    });
  });
}

/** Makes a copy of the repository. */
export function copyRepository(options: { readonly linkNodeModules: boolean }): RepositoryCopy {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bioeksen-portal-qa-"));
  for (const file of repositoryFiles()) {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(repositoryRoot, file), target);
  }
  const link = path.join(dir, "node_modules");
  if (options.linkNodeModules) {
    symlinkSync(path.join(repositoryRoot, "node_modules"), link, "junction");
  }
  const pnpm = pnpmInvocation();

  return {
    dir,
    pnpm: async (args, runOptions) => await runIn(dir, pnpm.command, [...pnpm.prefix, ...args], pnpm.shell, runOptions),
    run: async (command, args, runOptions) => await runIn(dir, command, args, false, runOptions),
    write: (relativePath, content) => {
      const target = path.join(dir, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    },
    read: (relativePath) => readFileSync(path.join(dir, relativePath), "utf8"),
    delete: (relativePath) => {
      rmSync(path.join(dir, relativePath), { force: true });
    },
    remove: () => {
      if (existsSync(link) && lstatSync(link).isSymbolicLink()) {
        // Remove the link itself, never the directory it points to.
        try {
          unlinkSync(link);
        } catch {
          rmdirSync(link);
        }
      }
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

/** The last lines of a command's output, for a failure message. */
export function tail(result: RunResult, lines = 40): string {
  return result.output.split(/\r?\n/).slice(-lines).join("\n");
}
