import { execFile, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Resolve the repository root from this script's location (tools/mcp/ci-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/** Resolve the gh executable name — on Windows, shimmed exes need `.exe`. */
const GH_CMD = process.platform === 'win32' ? 'gh.exe' : 'gh';

/** Run a GitHub CLI command from the repo root and return stdout (trimmed at end). */
export function runGh(args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      GH_CMD,
      args,
      {
        cwd: getRepoRoot(),
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
        shell: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr.trim() || stdout.trim() || error.message;
          reject(new Error(message));
          return;
        }

        // trimEnd preserves leading whitespace and blank lines so that
        // log line numbers remain accurate when correlating with GitHub output.
        resolvePromise(stdout.trimEnd());
      },
    );
  });
}

/**
 * Stream a GitHub CLI log command, collecting only the last `maxLines` lines
 * (ring buffer) to avoid exhausting memory on large workflow runs.
 */
export function streamGhLogs(
  args: string[],
  maxLines: number,
): Promise<{ lines: string[]; totalLines: number }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(GH_CMD, args, {
      cwd: getRepoRoot(),
      shell: false,
    });

    const ring: string[] = [];
    let totalLines = 0;
    let partial = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error('gh log stream timed out'));
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = partial + chunk.toString('utf8');
      const parts = text.split(/\r?\n/);
      partial = parts.pop() ?? '';
      for (const line of parts) {
        totalLines++;
        ring.push(line);
        if (ring.length > maxLines) {
          ring.shift();
        }
      }
    });

    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (partial) {
        totalLines++;
        ring.push(partial);
        if (ring.length > maxLines) ring.shift();
      }
      if (code !== 0) {
        const msg = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(msg || `gh exited with code ${code}`));
        return;
      }
      resolvePromise({ lines: ring, totalLines });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) reject(err);
    });
  });
}

export function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}
