import type { CICheck } from '../types.js';

export interface CheckRunNode {
  __typename: 'CheckRun';
  name: string;
  status: string;
  conclusion: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface StatusContextNode {
  __typename: 'StatusContext';
  context: string;
  state: string;
  createdAt?: string | null;
}

export type StatusCheckNode = CheckRunNode | StatusContextNode;

export function normalizeChecks(nodes: (StatusCheckNode | null)[]): CICheck[] {
  return nodes
    .filter((node): node is StatusCheckNode => node != null)
    .map((node) => {
      if (node.__typename === 'CheckRun') {
        return {
          name: node.name,
          status: node.status,
          conclusion: node.conclusion,
          startedAt: node.completedAt ?? node.startedAt ?? null,
        };
      }
      // StatusContext
      return {
        name: node.context,
        status: node.state,
        conclusion:
          node.state === 'SUCCESS'
            ? 'SUCCESS'
            : node.state === 'PENDING'
              ? null
              : node.state,
        startedAt: node.createdAt ?? null,
      };
    });
}

/**
 * Deduplicate checks to the latest run per name. GraphQL's `statusCheckRollup`
 * does not collapse stale/cancelled runs left behind by reruns the way
 * `github_get_check_runs`'s REST-based dedup does, so `checksSummary` could
 * report a check as failing (and inflate `total`) off an earlier attempt even
 * though the latest run for that name succeeded (LS-8667). Mirrors the
 * latest-run-per-name tie-break in `required-checks.ts`'s `evaluateRequiredChecks`.
 */
export function dedupeLatestByName(checks: CICheck[]): CICheck[] {
  const latestByName = new Map<string, CICheck>();
  for (const check of checks) {
    const existing = latestByName.get(check.name);
    if (!existing) {
      latestByName.set(check.name, check);
      continue;
    }
    const time = new Date(check.startedAt ?? 0).getTime();
    const existingTime = new Date(existing.startedAt ?? 0).getTime();
    if (time > existingTime) latestByName.set(check.name, check);
  }
  return [...latestByName.values()];
}
