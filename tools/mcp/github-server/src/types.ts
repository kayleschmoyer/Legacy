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

export const FAILED_CONCLUSIONS = new Set([
  'FAILURE',
  'ERROR',
  'CANCELLED',
  'TIMED_OUT',
]);

const PENDING_STATUSES = new Set(['IN_PROGRESS', 'QUEUED', 'PENDING']);

/**
 * Deduplicate checks by name, keeping only the most recent run of each.
 * When statusCheckRollup includes checks from old SHAs alongside current
 * ones, stale failures can pollute the CI summary.
 */
export function deduplicateChecks(checks: CICheck[]): CICheck[] {
  const byName = new Map<string, CICheck>();
  for (const check of checks) {
    const existing = byName.get(check.name);
    if (!existing) {
      byName.set(check.name, check);
    } else if (
      check.startedAt &&
      (!existing.startedAt || check.startedAt > existing.startedAt)
    ) {
      byName.set(check.name, check);
    } else if (!check.startedAt && !existing.startedAt) {
      // Neither has a timestamp — prefer the later occurrence in the list
      // since GitHub returns checks in reverse-chronological order by default.
      byName.set(check.name, check);
    }
  }
  return [...byName.values()];
}

/**
 * Summarize CI status from a list of checks.
 * Aligned with FAILED_CONCLUSIONS / PENDING_STATUSES sets.
 *
 * Returns: 'none' | 'pass' | 'fail' | 'pending'
 */
export function summarizeCIStatus(checks: CICheck[] | null): string {
  if (!checks || checks.length === 0) return 'none';

  const conclusions = checks.map((c) => c.conclusion ?? c.status);

  if (conclusions.some((c) => FAILED_CONCLUSIONS.has(c))) return 'fail';
  if (conclusions.some((c) => PENDING_STATUSES.has(c))) return 'pending';
  // Everything remaining is SUCCESS, SKIPPED, NEUTRAL, or similar non-failing
  return 'pass';
}
