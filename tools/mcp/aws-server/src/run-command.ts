import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 60_000;

/** Resolve the repository root from this script's location (tools/mcp/aws-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/**
 * Run a shell command and return stdout.
 * Sets AWS_PAGER="" and PYTHONIOENCODING=utf-8 automatically for all commands.
 * Throws on non-zero exit.
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AWS_PAGER: '',
      PYTHONIOENCODING: 'utf-8',
      ...extraEnv,
    };

    execFile(
      command,
      args,
      { cwd, timeout: COMMAND_TIMEOUT, shell: true, env },
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
