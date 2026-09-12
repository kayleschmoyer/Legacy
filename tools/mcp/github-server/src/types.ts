/** Minimal MCP tool result type matching the SDK's CallToolResult. */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** CI check entry from GitHub's statusCheckRollup. */
export interface CICheck {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt?: string | null;
}

/**
 * Conclusions that mean "re-running this check is worthwhile" — used by
 * `github_retrigger_check` and `github_pr_scan`. CANCELLED belongs here because
 * a cancelled run is exactly the kind of run you want to re-dispatch; it does
 * **not** belong in a status summary, which is why `CI_FAILURE_CONCLUSIONS`
 * below exists separately.
 */
export const FAILED_CONCLUSIONS = new Set([
  'FAILURE',
  'ERROR',
  'CANCELLED',
  'TIMED_OUT',
]);

/**
 * GraphQL `CheckConclusionState` / `StatusState` values that represent a
 * genuine failure when *summarizing* a PR's CI. Expressed as an explicit
 * allow-list (rather than excluding known-benign conclusions) so an
 * unrecognized future conclusion defaults to "not a failure" instead of
 * silently reporting a healthy PR as broken.
 *
 * CANCELLED, SKIPPED and STALE are deliberately absent — see
 * `NON_RESULT_CONCLUSIONS` (LS-10116, same reasoning as LS-9384 for
 * `github_view_pr`'s `checksSummary`).
 */
export const CI_FAILURE_CONCLUSIONS = new Set([
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
]);

/**
 * Conclusions meaning "this run was superseded": a merge-queue attempt
 * cancelled by the next revalidation, a concurrency dedup, a check made stale
 * by a later push. Reported separately (e.g. `github_pr_batch_status`'s
 * `cancelledJobs`) so they stay visible without being mistaken for failures.
 */
export const SUPERSEDED_CONCLUSIONS = new Set(['CANCELLED', 'STALE']);

/**
 * Settled conclusions that carry no verdict: the run was superseded, or never
 * needed to run at all. These are an *absence* of a result, not a negative one,
 * so they neither fail nor hold back a summary.
 *
 * The CI pipeline's own "Summarize & Report" gate treats CANCELLED on a
 * critical step as a failure; that is correct for a merge gate and wrong for a
 * status summary an agent polls on every wake (LS-10116).
 */
export const NON_RESULT_CONCLUSIONS = new Set([
  ...SUPERSEDED_CONCLUSIONS,
  'SKIPPED',
]);

const PASS_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL']);

/**
 * Summarize CI status from a list of checks.
 *
 * Any conclusion that is neither a genuine failure, a pass, nor a non-result
 * is treated as pending so that new GitHub statuses (e.g.
 * AWAITING_COMMISSIONER_REVIEW) and in-flight runs are never silently reported
 * as passing.
 *
 * Returns: 'none' | 'pass' | 'fail' | 'pending'
 */
export function summarizeCIStatus(checks: CICheck[] | null): string {
  if (!checks || checks.length === 0) return 'none';

  const conclusions = checks.map((c) => c.conclusion ?? c.status);

  if (conclusions.some((c) => CI_FAILURE_CONCLUSIONS.has(c))) return 'fail';
  if (
    conclusions.some(
      (c) => !PASS_CONCLUSIONS.has(c) && !NON_RESULT_CONCLUSIONS.has(c),
    )
  ) {
    return 'pending';
  }
  return 'pass';
}
