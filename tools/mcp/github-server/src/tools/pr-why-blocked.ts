import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import { FAILED_CONCLUSIONS } from '../types.js';
import type { ToolResult } from '../types.js';

interface PRWhyBlockedParams {
  number: number;
}

// ── GraphQL response types ────────────────────────────────────────────────────

interface CheckRunNode {
  __typename: 'CheckRun';
  name: string;
  status: string;
  conclusion: string | null;
}

interface StatusContextNode {
  __typename: 'StatusContext';
  context: string;
  state: string;
}

type StatusCheckNode = CheckRunNode | StatusContextNode;

interface ReviewerUser {
  __typename: 'User';
  login: string;
}

interface ReviewerTeam {
  __typename: 'Team';
  name: string;
}

interface PRWhyBlockedGraphQLResponse {
  repository: {
    pullRequest: null | {
      number: number;
      title: string;
      state: string;
      url: string;
      isDraft: boolean;
      mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
      isInMergeQueue: boolean;
      reviewDecision: string | null;
      labels: {
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{ name: string }>;
      };
      autoMergeRequest: { enabledBy: { login: string } } | null;
      commits: {
        nodes: Array<{
          commit: {
            statusCheckRollup: {
              contexts: {
                nodes: Array<StatusCheckNode | null>;
              };
            } | null;
          };
        }>;
      };
      reviews: {
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{
          author: { login: string } | null;
          state: string;
          submittedAt: string;
        }>;
      };
      reviewRequests: {
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{
          requestedReviewer:
            | ReviewerUser
            | ReviewerTeam
            | { __typename: string }
            | null;
        }>;
      };
      reviewThreads: {
        totalCount: number;
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{ isResolved: boolean; isOutdated: boolean }>;
      };
    };
  };
}

const PR_WHY_BLOCKED_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      state
      url
      isDraft
      mergeable
      isInMergeQueue
      reviewDecision
      autoMergeRequest { enabledBy { login } }
      labels(first: 100) {
        pageInfo { hasNextPage }
        nodes { name }
      }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  ... on CheckRun { __typename name status conclusion }
                  ... on StatusContext { __typename context state }
                }
              }
            }
          }
        }
      }
      reviews(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          author { login }
          state
          submittedAt
        }
      }
      reviewRequests(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          requestedReviewer {
            __typename
            ... on User { login }
            ... on Team { name }
          }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        pageInfo { hasNextPage }
        nodes { isResolved isOutdated }
      }
    }
  }
}`;

// ── CI helpers ────────────────────────────────────────────────────────────────

// Mirrors the EXCLUDED_CHECKS set in .github/scripts/merge-queue-processor.js.
// process-merge-queue would be circular (the job is the merge queue itself).
// delayed-recheck is a housekeeping job, not a quality gate.
const EXCLUDED_CHECK_NAMES = new Set([
  'process-merge-queue',
  'delayed-recheck',
]);

const PENDING_STATUSES = new Set([
  'IN_PROGRESS',
  'QUEUED',
  'PENDING',
  'WAITING',
]);

interface CIPartition {
  failing: string[];
  pending: string[];
  passing: number;
}

export function partitionChecks(
  nodes: (StatusCheckNode | null)[],
): CIPartition {
  const failing: string[] = [];
  const pending: string[] = [];
  let passing = 0;

  for (const node of nodes) {
    if (node == null) continue;
    const name = node.__typename === 'CheckRun' ? node.name : node.context;
    if (EXCLUDED_CHECK_NAMES.has(name)) continue;
    const conclusion =
      node.__typename === 'CheckRun' ? node.conclusion : node.state;
    const status = node.__typename === 'CheckRun' ? node.status : node.state;

    if (conclusion && FAILED_CONCLUSIONS.has(conclusion)) {
      failing.push(name);
    } else if (!conclusion && PENDING_STATUSES.has(status)) {
      pending.push(name);
    } else if (
      conclusion === 'SUCCESS' ||
      conclusion === 'NEUTRAL' ||
      conclusion === 'SKIPPED' ||
      status === 'COMPLETED'
    ) {
      passing++;
    } else if (PENDING_STATUSES.has(status)) {
      pending.push(name);
    } else {
      passing++;
    }
  }

  return { failing, pending, passing };
}

// ── Diagnosis ─────────────────────────────────────────────────────────────────

type PRStatus = 'DONE' | 'BLOCKED' | 'WAITING' | 'READY';

interface Diagnosis {
  status: PRStatus;
  reason: string;
  summary: string;
  details: Record<string, unknown>;
  nextAction: string;
}

function reviewerName(
  reviewer: ReviewerUser | ReviewerTeam | { __typename: string } | null,
): string {
  if (!reviewer) return 'unknown';
  if (reviewer.__typename === 'User') return (reviewer as ReviewerUser).login;
  if (reviewer.__typename === 'Team')
    return `@${(reviewer as ReviewerTeam).name}`;
  return reviewer.__typename;
}

export function diagnose(
  pr: NonNullable<PRWhyBlockedGraphQLResponse['repository']['pullRequest']>,
): Diagnosis {
  const labels = new Set(pr.labels.nodes.map((l) => l.name));
  const hasReadyLabel = labels.has('bot:ready-for-review');
  const hasMergeWhenReady = labels.has('merge-when-ready');
  const labelsTruncated = pr.labels.pageInfo.hasNextPage;
  const reviewsTruncated = pr.reviews.pageInfo.hasNextPage;
  const reviewRequestsTruncated = pr.reviewRequests.pageInfo.hasNextPage;

  // CI partition
  const checkNodes =
    pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  const ci = partitionChecks(checkNodes);

  // Unresolved, non-outdated review threads.
  // pageInfo.hasNextPage means >100 threads exist; unresolved count from nodes
  // is a lower bound in that case (we can't see beyond the first 100).
  const threadsTruncated = pr.reviewThreads.pageInfo.hasNextPage;
  const unresolvedThreads = pr.reviewThreads.nodes.filter(
    (t) => !t.isResolved && !t.isOutdated,
  ).length;

  // Latest review state per reviewer (keep most recent)
  const latestByReviewer = new Map<string, string>();
  for (const r of pr.reviews.nodes) {
    const login = r.author?.login ?? 'unknown';
    latestByReviewer.set(login, r.state);
  }
  const hasChangesRequested = [...latestByReviewer.values()].some(
    (s) => s === 'CHANGES_REQUESTED',
  );

  // Review requests
  const pendingReviewers = pr.reviewRequests.nodes.map((n) =>
    reviewerName(n.requestedReviewer),
  );

  // ── Priority-ordered checks ───────────────────────────────────────────────

  if (pr.state === 'MERGED') {
    return {
      status: 'DONE',
      reason: 'MERGED',
      summary: 'PR is already merged.',
      details: { url: pr.url },
      nextAction: 'Nothing — this PR is done.',
    };
  }

  if (pr.state === 'CLOSED') {
    return {
      status: 'DONE',
      reason: 'CLOSED',
      summary: 'PR was closed without merging.',
      details: { url: pr.url },
      nextAction:
        'Reopen the PR or create a new one if the work should continue.',
    };
  }

  if (pr.isDraft) {
    return {
      status: 'BLOCKED',
      reason: 'DRAFT',
      summary: 'PR is still in draft mode.',
      details: {},
      nextAction: 'Call github_mark_pr_ready to move it out of draft.',
    };
  }

  if (pr.mergeable === 'CONFLICTING') {
    return {
      status: 'BLOCKED',
      reason: 'MERGE_CONFLICT',
      summary: 'Branch has merge conflicts with the base branch.',
      details: { base: 'origin/main' },
      nextAction:
        'Rebase onto main to resolve conflicts, then force-push the branch.',
    };
  }

  if (ci.failing.length > 0) {
    return {
      status: 'BLOCKED',
      reason: 'CI_FAILING',
      summary: `${ci.failing.length} CI check${ci.failing.length === 1 ? '' : 's'} ${ci.failing.length === 1 ? 'is' : 'are'} failing.`,
      details: {
        failingChecks: ci.failing,
        pendingChecks: ci.pending,
        passingChecks: ci.passing,
      },
      nextAction:
        'Fix the root cause of the failing checks and push a new commit.',
    };
  }

  // CHANGES_REQUESTED + agent hasn't applied bot:ready-for-review yet
  if (
    (pr.reviewDecision === 'CHANGES_REQUESTED' || hasChangesRequested) &&
    !hasReadyLabel
  ) {
    return {
      status: 'BLOCKED',
      reason: 'CHANGES_REQUESTED',
      summary:
        'A reviewer has requested changes and bot:ready-for-review has not been applied.',
      details: {
        unresolvedThreads,
        ...(threadsTruncated ? { threadCountTruncated: true } : {}),
        reviewDecision: pr.reviewDecision,
        reviewerStates: Object.fromEntries(latestByReviewer),
      },
      nextAction:
        'Address the review comments, fix any unresolved threads, push a commit, then apply the bot:ready-for-review label to trigger the next review cycle.',
    };
  }

  // Unresolved threads with no ready label — agent hasn't signalled fixes yet
  if (unresolvedThreads > 0 && !hasReadyLabel) {
    return {
      status: 'BLOCKED',
      reason: 'UNRESOLVED_THREADS',
      summary: `${unresolvedThreads} unresolved review thread${unresolvedThreads === 1 ? '' : 's'} with no bot:ready-for-review label.`,
      details: {
        unresolvedThreads,
        totalThreads: pr.reviewThreads.totalCount,
        ...(threadsTruncated ? { threadCountTruncated: true } : {}),
      },
      nextAction:
        'Resolve the review threads (or push fixes), then apply the bot:ready-for-review label.',
    };
  }

  // CHANGES_REQUESTED but ready label IS present — waiting for bot to re-review
  if (
    (pr.reviewDecision === 'CHANGES_REQUESTED' || hasChangesRequested) &&
    hasReadyLabel
  ) {
    return {
      status: 'WAITING',
      reason: 'AWAITING_RE_REVIEW',
      summary:
        'Fixes have been pushed and bot:ready-for-review is applied; waiting for the reviewer bot to re-review.',
      details: {
        unresolvedThreads,
        labels: [...labels],
      },
      nextAction:
        'Wait for the Reviewer Bot to pick up the bot:ready-for-review label and post its next review cycle.',
    };
  }

  // Unresolved threads but ready label IS present — agent pushed fixes, waiting
  if (unresolvedThreads > 0 && hasReadyLabel) {
    return {
      status: 'WAITING',
      reason: 'AWAITING_RE_REVIEW',
      summary: `${unresolvedThreads} threads still open but bot:ready-for-review is applied; waiting for reviewer bot.`,
      details: {
        unresolvedThreads,
        totalThreads: pr.reviewThreads.totalCount,
        ...(threadsTruncated ? { threadCountTruncated: true } : {}),
        labels: [...labels],
      },
      nextAction:
        'Wait for the Reviewer Bot to re-review and resolve or respond to the threads.',
    };
  }

  // REVIEW_REQUIRED with pending review requests
  if (pr.reviewDecision === 'REVIEW_REQUIRED' && pendingReviewers.length > 0) {
    return {
      status: 'WAITING',
      reason: 'AWAITING_REVIEW',
      summary: `Review requested from ${pendingReviewers.join(', ')} but no review has been submitted yet.`,
      details: { pendingReviewers },
      nextAction: 'Wait for the reviewer(s) to submit their review.',
    };
  }

  // REVIEW_REQUIRED but nobody assigned
  if (
    pr.reviewDecision === 'REVIEW_REQUIRED' &&
    pendingReviewers.length === 0
  ) {
    return {
      status: 'BLOCKED',
      reason: 'NO_REVIEWER_ASSIGNED',
      summary: 'Review is required but no reviewer has been requested.',
      details: { reviewDecision: pr.reviewDecision },
      nextAction:
        'Request a reviewer via github_request_review or apply the bot:ready-for-review label to trigger the Reviewer Bot.',
    };
  }

  if (ci.pending.length > 0) {
    return {
      status: 'WAITING',
      reason: 'CI_PENDING',
      summary: `${ci.pending.length} CI check${ci.pending.length === 1 ? '' : 's'} still running.`,
      details: {
        pendingChecks: ci.pending,
        passingChecks: ci.passing,
      },
      nextAction: 'Wait for CI to finish.',
    };
  }

  if (pr.isInMergeQueue) {
    return {
      status: 'WAITING',
      reason: 'IN_MERGE_QUEUE',
      summary: 'PR is in the merge queue.',
      details: { hasMergeWhenReady },
      nextAction: 'Wait for the merge queue to process this PR.',
    };
  }

  if (pr.autoMergeRequest) {
    return {
      status: 'WAITING',
      reason: 'AUTO_MERGE_QUEUED',
      summary: `Auto-merge is enabled (set by ${pr.autoMergeRequest.enabledBy.login}); PR will merge once all required checks pass.`,
      details: { enabledBy: pr.autoMergeRequest.enabledBy.login },
      nextAction: 'Wait — auto-merge will complete this PR automatically.',
    };
  }

  if (pr.mergeable === 'UNKNOWN') {
    return {
      status: 'WAITING',
      reason: 'MERGEABLE_UNKNOWN',
      summary:
        'GitHub is still computing the mergeability of this PR (UNKNOWN state).',
      details: {},
      nextAction:
        'Retry in a few seconds; GitHub recomputes this asynchronously.',
    };
  }

  // All clear
  return {
    status: 'READY',
    reason: 'READY',
    summary: 'PR is approved, CI is passing, and there are no conflicts.',
    details: {
      reviewDecision: pr.reviewDecision,
      ciPassing: ci.passing,
      hasMergeWhenReady,
      labels: [...labels],
      ...(labelsTruncated ? { labelsTruncated: true } : {}),
      ...(reviewsTruncated ? { reviewsTruncated: true } : {}),
      ...(reviewRequestsTruncated ? { reviewRequestsTruncated: true } : {}),
    },
    nextAction: hasMergeWhenReady
      ? 'merge-when-ready label is applied — the bot will merge this automatically.'
      : 'Apply the merge-when-ready label (Reviewer Bot) or merge manually.',
  };
}

// ── Exported tool ─────────────────────────────────────────────────────────────

export async function prWhyBlocked(
  params: PRWhyBlockedParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const result = await githubGraphQL<PRWhyBlockedGraphQLResponse>(
      PR_WHY_BLOCKED_QUERY,
      { owner: repo.owner, repo: repo.name, number: params.number },
    );

    const pr = result.data.repository.pullRequest;
    if (!pr) {
      return {
        isError: true,
        content: [{ type: 'text', text: `PR #${params.number} not found.` }],
      };
    }

    const diagnosis = diagnose(pr);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              pr: { number: pr.number, title: pr.title, url: pr.url },
              ...diagnosis,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to diagnose PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
