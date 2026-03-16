import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 60_000;

/** Resolve the repository root from this script's location (tools/mcp/db-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/** Run a command in a given directory and return stdout. Throws on non-zero exit. */
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
      { cwd, timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || stdout?.trim() || err.message;
          reject(new Error(msg));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

/** Run a pnpm script in a given directory. */
export function runPnpm(
  args: string[],
  cwd: string,
  timeoutMs?: number,
): Promise<string> {
  return runCommand('pnpm', args, cwd, timeoutMs);
}
