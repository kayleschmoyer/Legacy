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
