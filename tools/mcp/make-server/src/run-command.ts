import { execFile } from 'node:child_process';

import { buildChildEnv } from './child-env.js';
import { resolveMainRepoPath } from './resolve-main-repo.js';

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

/**
 * Resolve the main repo root, from `process.cwd()`.
 *
 * Uses `git rev-parse --git-common-dir` rather than this script's own
 * `import.meta.url` (LS-4802): a worktree checkout has its own full copy of
 * `tools/mcp/make-server`, so a make-server process spawned from within a
 * worktree previously resolved "repo root" to the *worktree's* path instead
 * of the main repo — silently breaking `make worktree` (and every other
 * `getRepoRoot()` caller) whenever this server wasn't running from the main
 * repo's own checkout. `git rev-parse --git-common-dir` answers "where is
 * the main repo?" correctly from any worktree of it, no caller override
 * needed. See `resolveMainRepoPath` for details.
 */
export function getRepoRoot(): string {
  return resolveMainRepoPath(process.cwd());
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
