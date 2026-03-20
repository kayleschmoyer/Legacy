import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 60_000;

/** Resolve the repository root from this script's location (tools/mcp/db-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/** Run a command in a given directory and return stdout (falling back to stderr when stdout is empty). Throws on non-zero exit. */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
  opts?: { shell?: boolean },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        shell: opts?.shell ?? false,
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || stdout?.trim() || err.message;
          reject(new Error(msg));
          return;
        }
        // Prefer stdout; fall back to stderr when stdout is empty (some
        // tools like pnpm write diagnostics only to stderr).
        const output = stdout?.trim() || stderr?.trim() || '';
        resolve(output);
      },
    );
  });
}

/**
 * Run a pnpm script in a given directory.
 * Uses shell: true because corepack-shimmed pnpm is not found by execFile
 * on Windows without a shell.
 */
export function runPnpm(
  args: string[],
  cwd: string,
  timeoutMs?: number,
): Promise<string> {
  return runCommand('pnpm', args, cwd, timeoutMs, { shell: true });
}
