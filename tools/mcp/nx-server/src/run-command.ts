import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 120_000;

/** Known npm-wrapper commands that need `.cmd` extension on Windows with shell:false. */
const NPM_WRAPPER_COMMANDS = new Set(['pnpm', 'npm', 'npx', 'yarn']);

/** On Windows, execFile with shell:false requires the `.cmd` extension for npm/pnpm. */
function resolveCommand(command: string): string {
  if (process.platform === 'win32' && NPM_WRAPPER_COMMANDS.has(command)) {
    return `${command}.cmd`;
  }
  return command;
}

/** Resolve the repository root from this script's location (tools/mcp/nx-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/**
 * Run a command in a given directory and return stdout. Throws on non-zero exit.
 *
 * Uses `shell: false` to prevent shell injection — arguments are passed directly
 * to the process without shell interpretation. On Windows, `.cmd` extensions are
 * resolved automatically (e.g. `pnpm` → `pnpm.cmd`).
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      resolveCommand(command),
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
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
