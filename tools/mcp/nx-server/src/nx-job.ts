import path from 'node:path';
import { escapeCmdShellArg } from './cmd-escape.js';

/**
 * Single-call sync budget for job-backed tools — stays safely under the ~60s
 * MCP transport timeout in cloud sessions. Commands that finish inside the
 * budget return their result in one call; slower ones return a running
 * snapshot with a jobId to poll via nx_job_wait.
 */
export const SYNC_BUDGET_MS = 45_000;

export interface JobSpec {
  command: string;
  args: string[];
  shell: boolean;
}

/**
 * Build a background-job spawn spec for `pnpm <args>`.
 *
 * On Windows pnpm is a `.cmd` batch script that must run through cmd.exe
 * (`shell: true`) — spawning it directly throws EINVAL. With a shell, args
 * containing `|`, `<`, `>`, or whitespace are double-quoted so cmd.exe treats
 * them as literals (see cmd-escape.ts). Elsewhere pnpm is a plain binary and
 * runs without a shell.
 */
export function pnpmJobSpec(args: string[]): JobSpec {
  if (process.platform === 'win32') {
    return { command: 'pnpm', args: args.map(escapeCmdShellArg), shell: true };
  }
  return { command: 'pnpm', args, shell: false };
}

/** Build a background-job spawn spec for `pnpm exec nx <nxArgs>`. */
export function nxJobSpec(nxArgs: string[]): JobSpec {
  return pnpmJobSpec(['exec', 'nx', ...nxArgs]);
}

/**
 * Build a background-job spawn spec that invokes a workspace-hoisted binary
 * (e.g. `playwright`) directly from `<repoRoot>/node_modules/.bin`, bypassing
 * `pnpm exec` entirely.
 *
 * `pnpm exec <bin>` resolves the *package* scope for the directory it is
 * spawned from before running anything — and when that directory has no
 * `package.json` of its own (e.g. `apps/web-e2e`, an Nx project with no
 * per-project package.json in this workspace), pnpm silently falls back to
 * running the command from the *workspace root* instead of the given `cwd`,
 * discarding it entirely (verified directly: `cd apps/web-e2e && pnpm exec
 * node -e "console.log(process.cwd())"` prints the repo root, not
 * apps/web-e2e; `pnpm --dir apps/web-e2e exec ...` / `pnpm -C ... exec ...`
 * don't help — pnpm errors outright trying to read that directory's
 * nonexistent package manifest). Every cwd-relative arg a caller builds
 * against its intended `cwd` (a relative `--config=` path, spec paths
 * relative to the target directory, etc.) then resolves against the wrong
 * base — this is the root cause LS-10022 (`nx_run_e2e_specs`) and LS-10021
 * (`nx_run_eslint`) both hit, independently, against the same
 * package-less `apps/web-e2e` directory.
 *
 * Invoking the resolved binary directly sidesteps pnpm's package-scope
 * resolution altogether, so the job's `cwd` option (passed straight to
 * `child_process.spawn`) is honored regardless of whether that directory
 * has its own `package.json`. Uses the same Windows `.cmd` + shell:true
 * pattern as `pnpmJobSpec` (`.bin` wrapper scripts are batch files on
 * Windows too).
 */
export function binJobSpec(
  repoRoot: string,
  bin: string,
  args: string[],
): JobSpec {
  const binPath = path.join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${bin}.cmd` : bin,
  );
  if (process.platform === 'win32') {
    return { command: binPath, args: args.map(escapeCmdShellArg), shell: true };
  }
  return { command: binPath, args, shell: false };
}
