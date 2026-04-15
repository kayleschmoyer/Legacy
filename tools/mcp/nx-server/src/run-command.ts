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
 *
 * Pass `includeStderr: true` to append stderr to the returned string on success.
 * Use this for commands like Jest that write test results to stderr — callers
 * that parse stdout as JSON (e.g. nx show project --json) must NOT set this flag.
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
  env?: Record<string, string>,
  includeStderr = false,
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
        ...(env
          ? {
              env: {
                ...process.env,
                ...env,
                // Preserve the host PATH so spawned processes can find binaries
                // even if the caller-supplied env includes a PATH/Path key.
                ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
                ...(process.env.Path ? { Path: process.env.Path } : {}),
              },
            }
          : {}),
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
        if (includeStderr) {
          const parts = [stderr?.trim(), stdout?.trim()].filter(Boolean);
          resolve(parts.join('\n'));
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

/** Run a pnpm command in a given directory. */
export function runPnpm(
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
  env?: Record<string, string>,
  includeStderr = false,
): Promise<string> {
  return runCommand('pnpm', args, cwd, timeoutMs, env, includeStderr);
}

/**
 * Patterns that indicate the Nx daemon crashed due to a startup race.
 * This happens when two `nx` invocations start simultaneously and both
 * try to bind the same daemon socket (EADDRINUSE). The losing process
 * exits immediately; retrying after a short delay lets the winning
 * daemon finish initialising.
 */
const DAEMON_RACE_PATTERNS = [
  /daemon process terminated and closed the connection/i,
  /this process is no longer the current daemon/i,
  /EADDRINUSE/,
];

function isDaemonRaceError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return DAEMON_RACE_PATTERNS.some((re) => re.test(msg));
}

const DAEMON_RETRY_DELAY_MS = 2_000;
const DAEMON_MAX_RETRIES = 3;

/** Run an Nx command via pnpm exec. Retries on daemon race errors. */
export async function runNx(
  args: string[],
  cwd: string,
  opts?: {
    timeoutMs?: number;
    env?: Record<string, string>;
    includeStderr?: boolean;
  },
): Promise<string> {
  for (let attempt = 0; attempt <= DAEMON_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, DAEMON_RETRY_DELAY_MS));
    }
    try {
      return await runPnpm(
        ['exec', 'nx', ...args],
        cwd,
        opts?.timeoutMs ?? COMMAND_TIMEOUT,
        opts?.env,
        opts?.includeStderr ?? false,
      );
    } catch (err) {
      if (isDaemonRaceError(err) && attempt < DAEMON_MAX_RETRIES) {
        continue;
      }
      throw err;
    }
  }
  // Unreachable: the loop always returns or throws, but TypeScript requires
  // an exhaustive return path.
  /* istanbul ignore next */
  throw new Error('runNx: exceeded retry limit');
}
