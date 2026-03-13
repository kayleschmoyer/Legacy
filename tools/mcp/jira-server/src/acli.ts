import { execFile } from 'node:child_process';

const ACLI_TIMEOUT = 30_000;

/** Run an acli command and return its stdout. Throws on non-zero exit. */
export function runAcli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'acli',
      ['jira', ...args],
      { timeout: ACLI_TIMEOUT, shell: true },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || stdout?.trim() || err.message;
          reject(new Error(`acli failed: ${msg}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}
