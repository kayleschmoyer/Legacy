import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Resolve the repository root from this script's location (tools/mcp/github-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

/** Resolve the gh executable name — on Windows, shimmed exes need `.exe`. */
const GH_CMD = process.platform === 'win32' ? 'gh.exe' : 'gh';

/** Run a GitHub CLI command from the repo root and return stdout. */
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
        resolvePromise(stdout.trimEnd());
      },
    );
  });
}

/** Run `gh` and parse the JSON output. */
export async function runGhJson<T>(args: string[]): Promise<T> {
  const raw = await runGh(args);
  return JSON.parse(raw) as T;
}

/** Run a GraphQL query/mutation via `gh api graphql`. */
export async function runGraphQL<T>(
  query: string,
  variables: Record<string, string | number>,
): Promise<T> {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'number') {
      args.push('-F', `${key}=${value}`);
    } else {
      args.push('-f', `${key}=${value}`);
    }
  }
  return runGhJson<T>(args);
}
