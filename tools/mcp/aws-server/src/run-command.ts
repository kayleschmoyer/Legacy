import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT = 60_000;
/** Matches Node's previous implicit `execFile` default so existing callers see no behavior change. */
const DEFAULT_MAX_BUFFER = 1024 * 1024;

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
 *
 * Runs with `shell: false`: `aws` and `terraform` (the only commands this
 * server invokes) are real executables on every platform, not npm-style
 * `.cmd` wrappers, so no shell is needed. `shell: true` previously forced
 * Node to join `command` and `args` into a single string handed to the
 * platform shell for re-parsing — which strips unescaped quotes/braces from
 * args like the SSM `--parameters` JSON payload (`{"commands":[...]}`
 * became `{commands:[...]}` once the shell removed the quoting), breaking
 * `aws ssm send-command`. `execFile` with `shell: false` passes `args` to
 * the OS as an argv array with no re-parsing, so arguments reach the
 * process byte-for-byte.
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
  timeout: number = COMMAND_TIMEOUT,
  maxBuffer: number = DEFAULT_MAX_BUFFER,
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
        shell: false,
        env,
        maxBuffer,
        // CREATE_NO_WINDOW: suppress the console window that cmd.exe/powershell.exe
        // would otherwise flash when spawned from a hidden stdio MCP child on Windows.
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (err) {
          // Node kills the process and still hands back everything buffered
          // so far when stdout exceeds `maxBuffer` — resolve with that partial
          // output instead of rejecting, so a big-output command isn't turned
          // into an error whose message *is* the oversized dump (the caller's
          // own truncation/size caps, where present, take it from here).
          if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            resolve((stdout || '').trim());
            return;
          }
          const msg = stderr?.trim() || stdout?.trim() || err.message;
          reject(new Error(msg));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}
