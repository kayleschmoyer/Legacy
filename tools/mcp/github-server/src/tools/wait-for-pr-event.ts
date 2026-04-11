import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import {
  deduplicateChecks,
  summarizeCIStatus,
  FAILED_CONCLUSIONS,
} from '../types.js';
import type { CICheck, ToolResult } from '../types.js';

export type PREventType =
  | 'checks_failed'
  | 'checks_passed'
  | 'new_review_thread'
  | 'review_changes_requested'
  | 'review_approved'
  | 'conflicts'
  | 'merged'
  | 'closed';

export const ALL_PR_EVENTS: PREventType[] = [
  'checks_failed',
  'checks_passed',
  'new_review_thread',
  'review_changes_requested',
  'review_approved',
  'conflicts',
  'merged',
  'closed',
];

interface WaitForPREventParams {
  number: number;
  waitFor?: PREventType[];
  timeoutMs?: number;
}

// --- GraphQL shape ---

interface CheckRunNode {
  __typename: 'CheckRun';
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  detailsUrl: string | null;
}

interface StatusContextNode {
  __typename: 'StatusContext';
  context: string;
  state: string;
  targetUrl: string | null;
}

type StatusCheckNode = CheckRunNode | StatusContextNode;

interface ReviewNode {
  author: { login: string } | null;
  state: string;
  submittedAt: string;
}

interface ThreadComment {
  author: { login: string } | null;
  body: string;
  path: string | null;
  line: number | null;
}

interface ReviewThreadNode {
  id: string;
  isResolved: boolean;
  comments: { nodes: ThreadComment[] };
}

interface PRGraphQLResponse {
  repository: {
    pullRequest: null | {
      number: number;
      title: string;
      state: string;
      mergeable: string;
      commits: {
        nodes: Array<{
          commit: {
            statusCheckRollup: {
              contexts: { nodes: Array<StatusCheckNode | null> };
            } | null;
          };
        }>;
      };
      reviews: { nodes: ReviewNode[] };
      reviewThreads: {
        pageInfo: { hasNextPage: boolean };
        nodes: ReviewThreadNode[];
      };
    };
  };
}

// Fetches both CheckRuns (Checks API) and StatusContexts (Statuses API) via the
// GraphQL statusCheckRollup, which aggregates both into a single unified list.
// reviewThreads uses `last: 100` so the most recently opened threads are always
// returned even when a PR accumulates > 100 total threads.
const WAIT_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      state
      mergeable
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  ... on CheckRun {
                    __typename
                    name
                    status
                    conclusion
                    startedAt
                    detailsUrl
                  }
                  ... on StatusContext {
                    __typename
                    context
                    state
                    targetUrl
                  }
                }
              }
            }
          }
        }
      }
      reviews(last: 100) {
        nodes {
          author { login }
          state
          submittedAt
        }
      }
      reviewThreads(last: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              author { login }
              body
              path
              line
            }
          }
        }
      }
    }
  }
}`;

// NormalizedCheck extends CICheck (compatible with deduplicateChecks /
// summarizeCIStatus) and carries the extra fields needed for failedChecks output.
interface NormalizedCheck extends CICheck {
  type: 'check_run' | 'commit_status';
  url: string | null;
}

function normalizeCheckNodes(nodes: StatusCheckNode[]): NormalizedCheck[] {
  return nodes.map((node) => {
    if (node.__typename === 'CheckRun') {
      return {
        type: 'check_run' as const,
        name: node.name,
        status: node.status,
        conclusion: node.conclusion,
        startedAt: node.startedAt,
        url: node.detailsUrl,
      };
    }
    // StatusContext: map state to a conclusion-compatible value so
    // summarizeCIStatus and FAILED_CONCLUSIONS work correctly.
    const conclusion =
      node.state === 'SUCCESS'
        ? 'SUCCESS'
        : node.state === 'PENDING'
          ? null
          : node.state.toUpperCase();
    return {
      type: 'commit_status' as const,
      name: node.context,
      status: node.state,
      conclusion,
      startedAt: null,
      url: node.targetUrl,
    };
  });
}

// --- Snapshot type ---

interface PRSnapshot {
  number: number;
  title: string;
  state: string;
  mergeable: string;
  // Deduplicated via shared deduplicateChecks helper (same logic as dashboard/batch tools).
  checks: NormalizedCheck[];
  threadsResultTruncated: boolean;
  approvedCount: number;
  changesRequestedCount: number;
  unresolvedThreadIds: Set<string>;
  unresolvedThreadsById: Map<string, ReviewThreadNode>;
}

async function fetchSnapshot(
  owner: string,
  name: string,
  number: number,
): Promise<PRSnapshot | null> {
  const result = await githubGraphQL<PRGraphQLResponse>(WAIT_QUERY, {
    owner,
    repo: name,
    number,
  });

  const pr = result.data.repository.pullRequest;
  if (!pr) return null;

  const commitNode = pr.commits.nodes[0];
  const rawNodes = (
    commitNode?.commit.statusCheckRollup?.contexts.nodes ?? []
  ).filter((n): n is StatusCheckNode => n != null);

  // Normalize then deduplicate using the shared helper so stale check results
  // from older SHAs are collapsed the same way the dashboard/batch tools do it.
  const checks = deduplicateChecks(
    normalizeCheckNodes(rawNodes),
  ) as NormalizedCheck[];

  const threadsResultTruncated = pr.reviewThreads.pageInfo.hasNextPage;
  const unresolvedThreadIds = new Set<string>();
  const unresolvedThreadsById = new Map<string, ReviewThreadNode>();
  for (const t of pr.reviewThreads.nodes) {
    if (!t.isResolved) {
      unresolvedThreadIds.add(t.id);
      unresolvedThreadsById.set(t.id, t);
    }
  }

  // Only count APPROVED and CHANGES_REQUESTED (not COMMENTED/DISMISSED).
  // Copilot reviews come in as COMMENTED (review threads), not formal decisions.
  const approvedCount = pr.reviews.nodes.filter(
    (r) => r.state === 'APPROVED',
  ).length;
  const changesRequestedCount = pr.reviews.nodes.filter(
    (r) => r.state === 'CHANGES_REQUESTED',
  ).length;

  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    mergeable: pr.mergeable,
    checks,
    threadsResultTruncated,
    approvedCount,
    changesRequestedCount,
    unresolvedThreadIds,
    unresolvedThreadsById,
  };
}

interface FailedCheck {
  type: 'check_run' | 'commit_status';
  name: string;
  conclusion: string;
  url: string | null;
}

function getFailedChecks(checks: NormalizedCheck[]): FailedCheck[] {
  return checks
    .filter((c) => FAILED_CONCLUSIONS.has((c.conclusion ?? '').toUpperCase()))
    .map((c) => ({
      type: c.type,
      name: c.name,
      conclusion: c.conclusion ?? c.status,
      url: c.url,
    }));
}

// --- Result builder ---

function makeResult(
  event: PREventType,
  snap: PRSnapshot,
  extra: Record<string, unknown>,
): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            event,
            pr: {
              number: snap.number,
              title: snap.title,
              state: snap.state,
              mergeable: snap.mergeable,
            },
            ...extra,
          },
          null,
          2,
        ),
      },
    ],
  };
}

// --- Main export ---

export async function waitForPREvent(
  params: WaitForPREventParams,
): Promise<ToolResult> {
  const { number, waitFor = ALL_PR_EVENTS, timeoutMs = 600_000 } = params;
  const POLL_INTERVAL_MS = 10_000;

  const repo = await getRepoOwnerName();

  // Capture initial state
  let initial: PRSnapshot | null;
  try {
    initial = await fetchSnapshot(repo.owner, repo.name, number);
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch initial PR state for #${number}: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  if (!initial) {
    return {
      isError: true,
      content: [{ type: 'text', text: `PR #${number} not found.` }],
    };
  }

  // Terminal states fire immediately even on call entry — the PR is done and
  // there is nothing further to wait for.
  if (waitFor.includes('merged') && initial.state === 'MERGED') {
    return makeResult('merged', initial, {});
  }
  if (waitFor.includes('closed') && initial.state === 'CLOSED') {
    return makeResult('closed', initial, {});
  }

  const initialCIStatus = summarizeCIStatus(initial.checks);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let current: PRSnapshot | null;
    try {
      current = await fetchSnapshot(repo.owner, repo.name, number);
    } catch {
      // Transient error — keep polling
      continue;
    }
    if (!current) continue;

    // Terminal states
    if (waitFor.includes('merged') && current.state === 'MERGED') {
      return makeResult('merged', current, {});
    }
    if (waitFor.includes('closed') && current.state === 'CLOSED') {
      return makeResult('closed', current, {});
    }

    // Merge conflicts: only fire on a new CONFLICTING transition
    if (
      waitFor.includes('conflicts') &&
      current.mergeable === 'CONFLICTING' &&
      initial.mergeable !== 'CONFLICTING'
    ) {
      return makeResult('conflicts', current, {});
    }

    // CI: only fire on a new status transition (not on pre-existing state).
    // Covers both CheckRuns (Actions jobs) and StatusContexts (bot/external CI).
    // Uses shared deduplicateChecks + summarizeCIStatus helpers so stale results
    // from older runs/SHAs are collapsed the same way as the dashboard/batch tools.
    const currentCIStatus = summarizeCIStatus(current.checks);
    if (
      waitFor.includes('checks_failed') &&
      currentCIStatus === 'fail' &&
      initialCIStatus !== 'fail'
    ) {
      return makeResult('checks_failed', current, {
        failedChecks: getFailedChecks(current.checks),
        note: 'failedChecks type=check_run can be retriggered via github_retrigger_check; type=commit_status requires a new push or workflow dispatch. To get a runId for ci_get_logs, call ci_list_runs({ branch: "<headRefName>", limit: 1 }).',
      });
    }
    if (
      waitFor.includes('checks_passed') &&
      currentCIStatus === 'pass' &&
      initialCIStatus !== 'pass'
    ) {
      return makeResult('checks_passed', current, {});
    }

    // New unresolved review threads (fires for Copilot comments and human threads).
    if (waitFor.includes('new_review_thread')) {
      const newIds = [...current.unresolvedThreadIds].filter(
        (id) => !initial.unresolvedThreadIds.has(id),
      );
      if (newIds.length > 0) {
        const threads = newIds.map((id) => {
          const t = current!.unresolvedThreadsById.get(id);
          const first = t?.comments.nodes[0];
          return {
            id,
            author: first?.author?.login ?? 'unknown',
            body: first?.body ?? '',
            path: first?.path ?? null,
            line: first?.line ?? null,
          };
        });
        return makeResult('new_review_thread', current, {
          threads,
          ...(current.threadsResultTruncated
            ? {
                threadsResultTruncated: true,
                threadsNote:
                  'PR has > 100 review threads; only the 100 most recent are observed. Call github_get_review_threads for the full list.',
              }
            : {}),
        });
      }
    }

    // Formal review decisions — human reviewers only (Copilot uses COMMENTED).
    if (
      waitFor.includes('review_approved') &&
      current.approvedCount > initial.approvedCount
    ) {
      return makeResult('review_approved', current, {
        approvedCount: current.approvedCount,
      });
    }
    if (
      waitFor.includes('review_changes_requested') &&
      current.changesRequestedCount > initial.changesRequestedCount
    ) {
      return makeResult('review_changes_requested', current, {
        changesRequestedCount: current.changesRequestedCount,
      });
    }
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            event: 'timeout',
            pr: number,
            timeoutMs,
            message: `No matching event (${waitFor.join(', ')}) occurred within ${timeoutMs / 1000}s. The PR is still open — call github_wait_for_pr_event again to continue waiting.`,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
