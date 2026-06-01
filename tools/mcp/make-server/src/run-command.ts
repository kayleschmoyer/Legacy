import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 300_000; // 5 minutes default for make targets

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

/** Run a command in a given directory and return stdout. Throws on non-zero exit. */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT,
  shell = true,
  maxBuffer = 10 * 1024 * 1024,
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
  return runCommand('make', args, cwd, timeoutMs);
}
