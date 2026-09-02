import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildChildEnv } from './child-env.js';

const COMMAND_TIMEOUT = 300_000; // 5 minutes default for make targets

export { resolveBashExecutable } from './resolve-bash.js';

export class TimeoutError extends Error {
  readonly partialOutput: string;
  constructor(message: string, partialOutput: string) {
    super(message);
    this.name = 'TimeoutError';
    this.partialOutput = partialOutput;
  }
}

/** Resolve the repository root from this script's location (tools/mcp/make-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/**
 * Run a command in a given directory and return stdout. Throws on non-zero exit.
 *
 * `shell` defaults to `false` (execFile's own default) so callers get
 * shell-injection-free argument passing unless a call site is verified to need
 * shell interpretation (e.g. Windows PATH resolution for bare `make`/`pnpm`/`bash`,
 * which are resolved via .cmd/.bat shims that execFile cannot launch directly) —
 * see LS-9153.
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
  shell = false,
  maxBuffer = 10 * 1024 * 1024,
  env?: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: timeoutMs,
        shell,
        maxBuffer,
        // CREATE_NO_WINDOW: suppress the console window that cmd.exe/powershell.exe
        // would otherwise flash when spawned from a hidden stdio MCP child on Windows.
        windowsHide: true,
        env: buildChildEnv(env),
      },
      (err, stdout, stderr) => {
        if (err) {
          const parts = [stdout?.trim(), stderr?.trim()].filter(Boolean);
          // err.killed is true when execFile's timeout fires and kills the process
          if (err.killed) {
            reject(
              new TimeoutError(
                `Process timed out after ${timeoutMs}ms`,
                parts.join('\n'),
              ),
            );
            return;
          }
          // Include both stdout and stderr so callers get full context
          // (step output in stdout, error details in stderr)
          const msg = parts.join('\n') || err.message;
          reject(new Error(msg));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

/** Run a make command in a given directory. */
export function runMake(
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
): Promise<string> {
  // shell: true — on Windows, `make` is commonly resolved via a .cmd/.bat shim
  // (e.g. choco/scoop installs) that execFile cannot launch without a shell.
  return runCommand('make', args, cwd, timeoutMs, true);
}
