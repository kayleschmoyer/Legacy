/**
 * Detects the Nx Daemon project-graph failure mode (LS-8819): the daemon
 * bails before running any tasks, the child process still exits 0, and a
 * naive exit-code-derived `passed` reports false-green on zero tasks run.
 *
 * Deliberately does NOT hint at `nx reset` — that command is blocked
 * repo-wide by .claude/hooks/guard-risky-tools.mjs because it corrupts the
 * shared Nx cache for other worktrees. `make clean-cache` is the safe
 * remediation (it re-links the pooled node_modules symlink afterward).
 */
export const DAEMON_FAILURE_HINT =
  'The Nx Daemon failed to compute the project graph and no tasks ran. Do not trust this result as a pass. Run `make clean-cache` to reset the Nx cache, then retry.';

const DAEMON_FAILURE_MARKERS = [
  'Nx Daemon was not able to compute the project graph',
  'Nx Daemon is going to be disabled',
];

const TASK_COMPLETION_MARKERS = [
  'Successfully ran target',
  'No tasks were run',
];

/**
 * True when the output shows the Nx Daemon bailed on the project graph, or
 * when the output contains no task-completion line at all (belt-and-braces
 * for daemon-failure variants that don't match the known marker strings).
 */
export function isDaemonFailure(output: string): boolean {
  if (DAEMON_FAILURE_MARKERS.some((marker) => output.includes(marker))) {
    return true;
  }
  return !TASK_COMPLETION_MARKERS.some((marker) => output.includes(marker));
}
