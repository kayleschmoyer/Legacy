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

const PASS_CONCLUSIONS = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);

/**
 * Summarize CI status from a list of checks.
 * Aligned with FAILED_CONCLUSIONS / PASS_CONCLUSIONS sets.
 *
 * Any conclusion not in FAILED_CONCLUSIONS or PASS_CONCLUSIONS is treated as
 * pending so that new GitHub statuses (e.g. AWAITING_COMMISSIONER_REVIEW) are
 * never silently reported as passing.
 *
 * Returns: 'none' | 'pass' | 'fail' | 'pending'
 */
export function summarizeCIStatus(checks: CICheck[] | null): string {
  if (!checks || checks.length === 0) return 'none';

  const conclusions = checks.map((c) => c.conclusion ?? c.status);

  if (conclusions.some((c) => FAILED_CONCLUSIONS.has(c))) return 'fail';
  if (conclusions.some((c) => !PASS_CONCLUSIONS.has(c))) return 'pending';
  return 'pass';
}
