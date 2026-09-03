import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 120_000; // 2 minutes default — adb/gradle calls, not full builds

export class TimeoutError extends Error {
  readonly partialOutput: string;
  constructor(message: string, partialOutput: string) {
    super(message);
    this.name = 'TimeoutError';
    this.partialOutput = partialOutput;
  }
}

/** Resolve the repository root from this script's location (tools/mcp/android-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/**
 * Run a command and return stdout (trimmed). Throws on non-zero exit.
 *
 * `shell` defaults to `false` — adb/emulator/gradlew are invoked directly as
 * argv, never through shell text, so forwarded values (serials, package
 * names, AVD names) can never be interpreted as shell syntax. The one caller
 * that needs `shell: true` is the Windows `gradlew.bat` wrapper, which
 * execFile cannot launch without a shell (same class of issue as `make`/
 * `pnpm` .cmd shims — see make-server/src/run-command.ts).
 *
 * `env`, when passed, is merged on top of `process.env` (never a full
 * replacement) — a caller supplying one override var (e.g. `GITHUB_RUN_NUMBER`
 * for android_build) never has to remember to also spread `process.env`
 * itself, which would otherwise silently drop `PATH` and every other
 * inherited variable the child process needs.
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
  shell = false,
  maxBuffer = 10 * 1024 * 1024,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: timeoutMs,
        shell,
        maxBuffer,
        windowsHide: true,
        ...(env ? { env: { ...process.env, ...env } } : {}),
      },
      (err, stdout, stderr) => {
        if (err) {
          const parts = [stdout?.trim(), stderr?.trim()].filter(Boolean);
          if (err.killed) {
            reject(
              new TimeoutError(
                `Process timed out after ${timeoutMs}ms`,
                parts.join('\n'),
              ),
            );
            return;
          }
          const msg = parts.join('\n') || err.message;
          reject(new Error(msg));
          return;
        }
        resolvePromise(stdout.trim());
      },
    );
  });
}

/**
 * Run a command and return raw stdout bytes (for binary output like
 * `adb exec-out screencap -p`). Same shell-injection posture as {@link runCommand}.
 */
export function runCommandBuffer(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
  maxBuffer = 20 * 1024 * 1024,
  env?: NodeJS.ProcessEnv,
): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer,
        windowsHide: true,
        encoding: 'buffer',
        ...(env ? { env: { ...process.env, ...env } } : {}),
      },
      (err, stdout, stderr) => {
        if (err) {
          if (err.killed) {
            reject(
              new TimeoutError(
                `Process timed out after ${timeoutMs}ms`,
                stderr?.toString('utf8').trim() ?? '',
              ),
            );
            return;
          }
          reject(new Error(stderr?.toString('utf8').trim() || err.message));
          return;
        }
        resolvePromise(stdout);
      },
    );
  });
}
