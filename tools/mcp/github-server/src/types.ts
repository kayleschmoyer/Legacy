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
}

const FAILING_CONCLUSIONS = new Set([
  'FAILURE',
  'ERROR',
  'CANCELLED',
  'TIMED_OUT',
]);

const PENDING_STATUSES = new Set(['IN_PROGRESS', 'QUEUED', 'PENDING']);

/**
 * Summarize CI status from a list of checks.
 * Aligned with pr-scan's FAILING_CONCLUSIONS / PENDING_STATUSES sets.
 *
 * Returns: 'none' | 'pass' | 'fail' | 'pending' | 'mixed'
 */
export function summarizeCIStatus(checks: CICheck[] | null): string {
  if (!checks || checks.length === 0) return 'none';

  const conclusions = checks.map((c) => c.conclusion ?? c.status);

  if (conclusions.some((c) => FAILING_CONCLUSIONS.has(c))) return 'fail';
  if (conclusions.some((c) => PENDING_STATUSES.has(c))) return 'pending';
  // Everything remaining is SUCCESS, SKIPPED, NEUTRAL, or similar non-failing
  return 'pass';
}
