import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 120_000;

/** Resolve the repository root from this script's location (tools/mcp/nx-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/** Run a shell command in a given directory and return stdout. Throws on non-zero exit. */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, timeout: timeoutMs, shell: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // Include both stdout and stderr so callers get full error context
          // (e.g., TypeScript diagnostics appear in stdout, warnings in stderr)
          const parts = [stdout?.trim(), stderr?.trim()].filter(Boolean);
          const msg = parts.join('\n') || err.message;
          reject(new Error(msg));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

/** Run a pnpm command in a given directory. */
export function runPnpm(
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
): Promise<string> {
  return runCommand('pnpm', args, cwd, timeoutMs);
}

/** Run an Nx command via pnpm exec. */
export function runNx(
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
): Promise<string> {
  return runPnpm(['exec', 'nx', ...args], cwd, timeoutMs);
}
