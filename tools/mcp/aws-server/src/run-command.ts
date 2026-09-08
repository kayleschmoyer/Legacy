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
          // `err.code === 'ENOENT'` means the OS couldn't find the `command`
          // binary at all (not a non-zero exit from a found binary) — Node's
          // raw message is the cryptic `spawn aws ENOENT`. This is the normal
          // case in Claude Code Remote (CCR) sessions, which don't have the
          // AWS CLI (or Terraform) on PATH, so every aws_* tool otherwise
          // fails with the same unexplained ENOENT (LS-9537). Rewrite it into
          // an actionable message before it reaches any caller's own
          // remedy/hint parsing.
          if (err.code === 'ENOENT') {
            reject(
              new Error(
                `${command} CLI not found (spawn ${command} ENOENT): the "${command}" binary is not installed ` +
                  `or not on PATH in this environment. This is expected in Claude Code Remote (CCR) sessions, ` +
                  `which do not have the AWS CLI or Terraform installed — aws-server MCP tools cannot run there. ` +
                  `If running locally, install and configure the ${command} CLI.`,
              ),
            );
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

export interface CommandExitResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Like `runCommand`, but resolves with the exit code instead of rejecting on
 * a non-zero one. Callers that need to distinguish "the command ran and
 * reported a failure" (e.g. `packer fmt -check`, `packer validate`, where a
 * non-zero exit is an expected, structured result) from "the command could
 * not run at all" (missing binary) use this instead of parsing runCommand's
 * thrown Error message.
 */
export function runCommandCaptureExit(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
  timeout: number = COMMAND_TIMEOUT,
  maxBuffer: number = DEFAULT_MAX_BUFFER,
): Promise<CommandExitResult> {
  return new Promise((resolvePromise, reject) => {
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
      { cwd, timeout, shell: false, env, maxBuffer, windowsHide: true },
      (err, stdout, stderr) => {
        if (err?.code === 'ENOENT') {
          reject(
            new Error(
              `${command} CLI not found (spawn ${command} ENOENT): the "${command}" binary is not installed ` +
                `or not on PATH in this environment. This is expected in Claude Code Remote (CCR) sessions, ` +
                `which do not have the AWS CLI or Terraform installed — aws-server MCP tools cannot run there. ` +
                `If running locally, install and configure the ${command} CLI.`,
            ),
          );
          return;
        }
        const code = typeof err?.code === 'number' ? err.code : err ? 1 : 0;
        resolvePromise({
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
          code,
        });
      },
    );
  });
}
