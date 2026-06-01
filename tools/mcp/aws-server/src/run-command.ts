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
 * Sets AWS_PAGER="", PYTHONIOENCODING=utf-8:replace, and PYTHONUTF8=1 automatically
 * for all commands. The `:replace` suffix prevents Python from raising charmap
 * encode errors on emoji/non-ASCII log output (Windows-specific issue). PYTHONUTF8=1
 * enables Python 3.7+ UTF-8 mode as a belt-and-suspenders fallback.
 * Throws on non-zero exit.
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
  timeout: number = COMMAND_TIMEOUT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AWS_PAGER: '',
      PYTHONIOENCODING: 'utf-8:replace',
      PYTHONUTF8: '1',
      ...extraEnv,
    };

    execFile(
      command,
      args,
      {
        cwd,
        timeout,
        shell: true,
        env,
        // CREATE_NO_WINDOW: suppress the console window that cmd.exe/powershell.exe
        // would otherwise flash when spawned from a hidden stdio MCP child on Windows.
        windowsHide: true,
      },
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
