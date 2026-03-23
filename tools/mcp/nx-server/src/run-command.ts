import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 120_000;

/** Known npm-wrapper `.cmd` scripts that require `shell: true` on Windows. */
const NPM_WRAPPER_COMMANDS = new Set(['pnpm', 'npm', 'npx', 'yarn']);

/**
 * Resolve a command name to its platform-specific executable.
 *
 * On Windows with `shell: false`, npm wrappers need the explicit `.cmd`
 * extension. Currently npm wrappers always use `shell: true` (see
 * `needsShell` in `runCommand`), so this is a safety net — if that logic
 * ever changes, the `.cmd` fallback still works.
 */
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
 * On Windows, npm wrapper commands (pnpm, npm, npx, yarn) are `.cmd` batch
 * scripts that require `shell: true` (cmd.exe) — without it, execFile can fail
 * with EINVAL when args contain backslashes (e.g. Jest regex patterns).
 * All other commands use `shell: false` to avoid cmd.exe metacharacter risks
 * (`|`, `<`, `>`, `%`, etc.). Tool-level input validation
 * (SHELL_METACHAR_REGEX in run-target.ts) provides defence-in-depth.
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
): Promise<string> {
  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && NPM_WRAPPER_COMMANDS.has(command);
  return new Promise((resolve, reject) => {
    execFile(
      needsShell ? command : resolveCommand(command),
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        shell: needsShell,
      },
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
