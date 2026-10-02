import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import {
  detectConflictSignals,
  isConflictCheckFailure,
  isStaleConflictSignalOnly,
} from '../conflict-signals.js';
import { githubGraphQL } from '../github-api.js';
import {
  evaluatePRChecks,
  requiresCodeOwnerReview,
} from '../required-checks.js';
import type { CIPartition } from '../required-checks.js';
import type { ToolResult } from '../types.js';
import {
  deriveReviewDecision,
  fetchAllReviews,
  latestReviewsByAuthor,
} from '../utils/github-reviews.js';

interface PRWhyBlockedParams {
  number: number;
}

// ── GraphQL response types ────────────────────────────────────────────────────

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
      // GitHub's own authoritative merge-gate rollup — recomputed asynchronously
      // across ALL checks (not just the ones we resolve as "required"), reviews,
      // and conflicts. Used as a backstop against our own required-check
      // partition sampling too narrow a set of checks (LS-9888).
      mergeStateStatus:
        | 'BEHIND'
        | 'BLOCKED'
        | 'CLEAN'
        | 'DIRTY'
        | 'DRAFT'
        | 'HAS_HOOKS'
        | 'UNKNOWN'
        | 'UNSTABLE';
      isInMergeQueue: boolean;
      reviewDecision: string | null;
      // Head commit SHA + base branch — used to evaluate required checks via REST
      // (the merge-queue-aligned path) instead of GraphQL statusCheckRollup.
      headRefOid: string;
      baseRefName: string;
      labels: {
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{ name: string }>;
      };
      autoMergeRequest: { enabledBy: { login: string } } | null;
      reviews: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
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
      mergeStateStatus
      isInMergeQueue
      reviewDecision
      headRefOid
      baseRefName
      autoMergeRequest { enabledBy { login } }
      labels(first: 100) {
        pageInfo { hasNextPage }
        nodes { name }
      }
      reviews(first: 100) {
        pageInfo { hasNextPage endCursor }
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

// ── Diagnosis ─────────────────────────────────────────────────────────────────

type PRStatus = 'DONE' | 'BLOCKED' | 'WAITING' | 'READY';

export interface Diagnosis {
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

/**
 * Diagnose why a PR is (or isn't) mergeable. `ci` is the required-check partition
 * computed by the shared `evaluatePRChecks` helper — the same merge-queue-aligned
 * evaluation the processor uses, so triage and the merge gate agree.
 */
export function diagnose(
  pr: NonNullable<PRWhyBlockedGraphQLResponse['repository']['pullRequest']>,
  ci: CIPartition,
  requireCodeOwnerReview = false,
): Diagnosis {
  const labels = new Set(pr.labels.nodes.map((l) => l.name));
  const hasReadyLabel = labels.has('bot:ready-for-review');
  const hasMergeWhenReady = labels.has('merge-when-ready');
  const labelsTruncated = pr.labels.pageInfo.hasNextPage;
  const reviewsTruncated = pr.reviews.pageInfo.hasNextPage;
  const reviewRequestsTruncated = pr.reviewRequests.pageInfo.hasNextPage;

  // Unresolved, non-outdated review threads.
  // pageInfo.hasNextPage means >100 threads exist; unresolved count from nodes
  // is a lower bound in that case (we can't see beyond the first 100).
  const threadsTruncated = pr.reviewThreads.pageInfo.hasNextPage;
  const unresolvedThreads = pr.reviewThreads.nodes.filter(
    (t) => !t.isResolved && !t.isOutdated,
  ).length;

  // Effective review decision derived from each reviewer's latest review
  // state (dedup by author + submittedAt), not GitHub's `reviewDecision`
  // GraphQL field — that field can stay stale for minutes after a reviewer's
  // newest review supersedes their own earlier one (LS-8364, LS-8708).
  const effectiveReviewDecision = deriveReviewDecision(
    pr.reviews.nodes,
    pr.reviewDecision,
  );
  const latestByReviewer = new Map(
    latestReviewsByAuthor(pr.reviews.nodes).map((r) => [
      r.author?.login ?? 'unknown',
      r.state,
    ]),
  );
  const hasChangesRequested = effectiveReviewDecision === 'CHANGES_REQUESTED';

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

  // Conflict detection unions all three signals (GraphQL mergeable, the
  // CI: Conflicts label, the required "No Merge Conflicts" check) — GraphQL
  // mergeable alone goes UNKNOWN/stale on every base push, which used to let
  // conflicting PRs fall through to a misleading CI_FAILING verdict.
  const conflictSignals = detectConflictSignals({
    mergeable: pr.mergeable,
    mergeStateStatus: pr.mergeStateStatus,
    labels,
    failingChecks: ci.failing,
  });

  // LS-9945: a label/check-only verdict is lag once the live fields say clear.
  const conflictIsStaleAsyncSignalOnly = isStaleConflictSignalOnly(
    conflictSignals,
    pr,
  );

  if (conflictSignals.conflicting && !conflictIsStaleAsyncSignalOnly) {
    const otherFailing = ci.failing.filter((f) => !isConflictCheckFailure(f));
    return {
      status: 'BLOCKED',
      reason: 'MERGE_CONFLICT',
      summary: 'Branch has merge conflicts with the base branch.',
      details: {
        base: pr.baseRefName,
        signals: conflictSignals.sources,
        ...(otherFailing.length > 0 ? { alsoFailingChecks: otherFailing } : {}),
      },
      nextAction: `Rebase onto ${pr.baseRefName} to resolve conflicts, then force-push the branch.`,
    };
  }

  if (ci.failing.length > 0) {
    return {
      status: 'BLOCKED',
      reason: 'CI_FAILING',
      summary: `${ci.failing.length} required CI check${ci.failing.length === 1 ? '' : 's'} ${ci.failing.length === 1 ? 'is' : 'are'} failing.${pr.mergeable === 'UNKNOWN' ? ' (Mergeability is still being computed — conflicts cannot be ruled out yet.)' : ''}`,
      details: {
        failingChecks: ci.failing,
        pendingChecks: ci.pending,
        passingChecks: ci.passing,
        ...(pr.mergeable === 'UNKNOWN' ? { mergeable: 'UNKNOWN' } : {}),
      },
      nextAction:
        'Fix the root cause of the failing checks and push a new commit.',
    };
  }

  // CHANGES_REQUESTED + agent hasn't applied bot:ready-for-review yet
  if (hasChangesRequested && !hasReadyLabel) {
    return {
      status: 'BLOCKED',
      reason: 'CHANGES_REQUESTED',
      summary:
        'A reviewer has requested changes and bot:ready-for-review has not been applied.',
      details: {
        unresolvedThreads,
        ...(threadsTruncated ? { threadCountTruncated: true } : {}),
        reviewDecision: effectiveReviewDecision,
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
  if (hasChangesRequested && hasReadyLabel) {
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

  // Branch protection mandates a code-owner review (CODEOWNERS /
  // require_code_owner_review) and that requirement is not yet satisfied —
  // distinct from an ordinary manually-requested review so the agent doesn't
  // chase already-green CI or request a review from just anyone.
  //
  // Two ways the requirement can still be outstanding:
  //   1. REVIEW_REQUIRED — nothing has approved yet.
  //   2. APPROVED but a review request is still open. `reviewDecision` flips to
  //      APPROVED as soon as ANY required reviewer approves, so a CODEOWNERS
  //      catch-all entry (`*` -> the review bot) satisfies it while a
  //      path-specific owner has not approved. GraphQL does not decompose the
  //      decision per code-owner path, so the outstanding review request is the
  //      only direct signal — and GitHub's merge API keeps rejecting the merge
  //      with 405 "Waiting on code owner review from <owner>" the whole time.
  //      Trusting the decision alone reported a false READY (LS-9379, PR #7084).
  const hasPendingReviewRequest = pendingReviewers.length > 0;
  if (
    requireCodeOwnerReview &&
    (effectiveReviewDecision === 'REVIEW_REQUIRED' || hasPendingReviewRequest)
  ) {
    const owners = pendingReviewers.join(', ');
    const approvedButOutstanding =
      effectiveReviewDecision === 'APPROVED' && hasPendingReviewRequest;
    return {
      status: 'BLOCKED',
      reason: 'AWAITING_CODE_OWNER_REVIEW',
      summary: approvedButOutstanding
        ? `A code-owner review from ${owners} is still outstanding — the PR reads as APPROVED because another required reviewer (e.g. the CODEOWNERS catch-all) approved, but GitHub will refuse the merge until ${owners} approves.`
        : pendingReviewers.length > 0
          ? `A code-owner review is required and has not been submitted yet (requested from ${owners}).`
          : 'A code-owner review is required but no reviewer has been requested yet.',
      details: {
        pendingReviewers,
        requireCodeOwnerReviews: true,
        reviewDecision: effectiveReviewDecision,
        ...(approvedButOutstanding ? { approvedByOtherReviewers: true } : {}),
        ...(reviewRequestsTruncated ? { reviewRequestsTruncated: true } : {}),
        ...(hasMergeWhenReady ? { hasMergeWhenReady } : {}),
      },
      nextAction:
        pendingReviewers.length > 0
          ? `Wait for ${owners} to approve — the merge stays blocked until then, and the merge-when-ready label will not bypass it.`
          : 'Request a review from the code owner (see CODEOWNERS) or wait for GitHub to auto-assign one via CODEOWNERS.',
    };
  }

  // REVIEW_REQUIRED with pending review requests
  if (
    effectiveReviewDecision === 'REVIEW_REQUIRED' &&
    pendingReviewers.length > 0
  ) {
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
    effectiveReviewDecision === 'REVIEW_REQUIRED' &&
    pendingReviewers.length === 0
  ) {
    return {
      status: 'BLOCKED',
      reason: 'NO_REVIEWER_ASSIGNED',
      summary: 'Review is required but no reviewer has been requested.',
      details: { reviewDecision: effectiveReviewDecision },
      nextAction:
        'Request a reviewer via github_request_review or apply the bot:ready-for-review label to trigger the Reviewer Bot.',
    };
  }

  if (ci.pending.length > 0) {
    return {
      status: 'WAITING',
      reason: 'CI_PENDING',
      summary: `${ci.pending.length} required CI check${ci.pending.length === 1 ? '' : 's'} still running or not yet registered.`,
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

  // mergeStateStatus is GitHub's own authoritative merge-gate rollup, computed
  // across every check on the SHA (not only the required-name subset our own
  // `ci` partition tracks) plus reviews and conflicts. If everything we can see
  // looks clear but GitHub still reports BLOCKED, our partition is missing a
  // failing check outside its tracked scope — trust GitHub's verdict over ours
  // rather than returning a false READY (LS-9888). A merge-when-ready label
  // that reads absent here is consistent with the failure gate having just
  // stripped it, so surface that pairing explicitly instead of staying silent.
  if (pr.mergeStateStatus === 'BLOCKED') {
    return {
      status: 'BLOCKED',
      reason: 'MERGE_STATE_BLOCKED',
      summary:
        'GitHub reports this PR as not mergeable (mergeStateStatus: BLOCKED), even though the required checks tracked here show no failures — a check outside that tracked scope is likely still red.' +
        (!hasMergeWhenReady
          ? ' merge-when-ready is not applied, consistent with the failure gate having just stripped it.'
          : ''),
      details: {
        mergeStateStatus: pr.mergeStateStatus,
        ciPassingRequiredChecks: ci.passing,
        hasMergeWhenReady,
      },
      nextAction:
        'Check all check-runs on the head SHA (not just required contexts) for failures and fix the root cause, then push a new commit. Do not apply merge-when-ready yourself — that label is restored by the Reviewer Bot / failure gate once checks are green.',
    };
  }

  // All clear
  return {
    status: 'READY',
    reason: 'READY',
    summary:
      'PR is approved, required CI checks are passing, and there are no conflicts.',
    details: {
      reviewDecision: effectiveReviewDecision,
      ciPassingRequiredChecks: ci.passing,
      hasMergeWhenReady,
      labels: [...labels],
      ...(labelsTruncated ? { labelsTruncated: true } : {}),
      ...(reviewsTruncated ? { reviewsTruncated: true } : {}),
      ...(reviewRequestsTruncated ? { reviewRequestsTruncated: true } : {}),
    },
    nextAction: hasMergeWhenReady
      ? 'merge-when-ready label is applied — the bot will merge this automatically.'
      : 'Wait for the Reviewer Bot to (re-)apply merge-when-ready now that checks are green, or ask a maintainer to merge manually. Do not apply merge-when-ready yourself — the Author Agent Contract forbids it.',
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

    // Evaluate required checks the same way the merge-queue processor does:
    // required-name filter + latest-run-per-name dedup + commit statuses. This is
    // what prevents stale duplicate runs and non-required checks producing a
    // false CI_FAILING verdict (LS-7993). Fetched alongside the code-owner-review
    // branch-protection flag so a green PR blocked only on CODEOWNERS reports
    // AWAITING_CODE_OWNER_REVIEW instead of a generic review-required reason.
    const [ci, requireCodeOwnerReview] = await Promise.all([
      evaluatePRChecks(repo.owner, repo.name, pr.headRefOid, pr.baseRefName),
      requiresCodeOwnerReview(repo.owner, repo.name, pr.baseRefName),
    ]);

    // A `reviews(first: 100)` first page can still truncate on a
    // heavily-reviewed PR — fetch the rest so a reviewer's true latest state
    // is never missed by the per-author dedup inside diagnose().
    if (pr.reviews.pageInfo.hasNextPage) {
      pr.reviews.nodes = await fetchAllReviews(
        repo.owner,
        repo.name,
        params.number,
        pr.reviews,
      );
      pr.reviews.pageInfo.hasNextPage = false;
    }

    const diagnosis = diagnose(pr, ci, requireCodeOwnerReview);

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            pr: { number: pr.number, title: pr.title, url: pr.url },
            ...diagnosis,
          }),
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
