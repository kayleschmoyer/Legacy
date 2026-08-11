import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { detectConflictSignals } from '../conflict-signals.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import { evaluatePRChecks } from '../required-checks.js';
import type { ToolResult } from '../types.js';
import {
  fetchAllReviews,
  latestReviewsByAuthor,
} from '../utils/github-reviews.js';

interface DiagnoseParams {
  prNumber: number;
}

interface PRStateResponse {
  repository: {
    pullRequest: null | {
      number: number;
      title: string;
      url: string;
      state: string;
      isDraft: boolean;
      mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
      isInMergeQueue: boolean;
      headRefOid: string;
      baseRefName: string;
      reviewDecision: string | null;
      labels: { nodes: Array<{ name: string }> };
      reviews: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          author: { login: string } | null;
          state: string;
          submittedAt: string;
        }>;
      };
      reviewThreads: {
        totalCount: number;
        nodes: Array<{ isResolved: boolean }>;
      };
    };
  };
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  output: { title: string | null; summary: string | null };
}

interface CheckRunsPage {
  total_count: number;
  check_runs: CheckRun[];
}

const PR_STATE_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number title url state isDraft mergeable isInMergeQueue
      headRefOid baseRefName reviewDecision
      labels(first: 100) { nodes { name } }
      reviews(first: 20, states: [CHANGES_REQUESTED, APPROVED]) {
        pageInfo { hasNextPage endCursor }
        nodes { author { login } state submittedAt }
      }
      reviewThreads(first: 50) {
        totalCount
        nodes { isResolved }
      }
    }
  }
}`;

/** Fetch the latest check run per name (dedup stale runs). */
async function fetchFailingCheckRuns(
  owner: string,
  repo: string,
  sha: string,
): Promise<CheckRun[]> {
  let page = 1;
  const byName = new Map<string, CheckRun>();
  while (page <= 5) {
    const data = await githubRest<CheckRunsPage>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      query: { per_page: '100', page: String(page) },
    });
    for (const run of data.check_runs) {
      // Check-run ids increase monotonically, so the highest id is the most
      // recent run for a name (the API's response order is not guaranteed).
      const existing = byName.get(run.name);
      if (!existing || run.id > existing.id) byName.set(run.name, run);
    }
    if (data.check_runs.length < 100) break;
    page++;
  }
  return [...byName.values()].filter(
    (r) =>
      r.status === 'completed' &&
      r.conclusion !== 'success' &&
      r.conclusion !== 'skipped',
  );
}

type BlockReason =
  | 'DRAFT'
  | 'MERGE_CONFLICT'
  | 'CI_FAILING'
  | 'CHANGES_REQUESTED'
  | 'UNRESOLVED_THREADS'
  | 'AWAITING_REVIEW'
  | 'CI_PENDING'
  | 'IN_MERGE_QUEUE'
  | 'READY'
  | 'MERGED'
  | 'CLOSED';

function deriveReason(
  pr: NonNullable<PRStateResponse['repository']['pullRequest']>,
  ci: { hasFailures: boolean; isPending: boolean; failingNames: string[] },
  failing: CheckRun[],
): { reason: BlockReason; summary: string; nextAction: string } {
  if (pr.state === 'MERGED') {
    return {
      reason: 'MERGED',
      summary: 'PR is already merged.',
      nextAction: 'Nothing to do.',
    };
  }
  if (pr.state === 'CLOSED') {
    return {
      reason: 'CLOSED',
      summary: 'PR is closed.',
      nextAction: 'Re-open or create a new PR.',
    };
  }
  if (pr.isDraft) {
    return {
      reason: 'DRAFT',
      summary: 'PR is still in draft.',
      nextAction: 'Call github_mark_pr_ready to mark it ready for review.',
    };
  }
  // Union of all three conflict signals — GraphQL mergeable alone goes
  // UNKNOWN/stale on every base push (see conflict-signals.ts).
  const conflictSignals = detectConflictSignals({
    mergeable: pr.mergeable,
    labels: pr.labels.nodes.map((l) => l.name),
    failingChecks: ci.failingNames,
  });
  if (conflictSignals.conflicting) {
    return {
      reason: 'MERGE_CONFLICT',
      summary: `PR has merge conflicts (${conflictSignals.sources.join(', ')}).`,
      nextAction:
        'Rebase onto main: worktree_rebase_onto_main or worktree_rebase.',
    };
  }
  if (ci.hasFailures) {
    const names = failing.map((r) => r.name).join(', ');
    const unknownNote =
      pr.mergeable === 'UNKNOWN'
        ? ' (Mergeability is still being computed — conflicts cannot be ruled out yet.)'
        : '';
    return {
      reason: 'CI_FAILING',
      summary: `CI failing: ${names || 'unknown jobs'}${unknownNote}`,
      nextAction: 'Fix the failing tests/checks, then push.',
    };
  }
  const changesRequested = latestReviewsByAuthor(pr.reviews.nodes).some(
    (r) => r.state === 'CHANGES_REQUESTED',
  );
  if (changesRequested) {
    return {
      reason: 'CHANGES_REQUESTED',
      summary: 'Reviewer has requested changes.',
      nextAction:
        'Address the review comments and call github_finish_fix_round to post replies + re-trigger review.',
    };
  }
  const unresolvedThreads = pr.reviewThreads.nodes.filter(
    (t) => !t.isResolved,
  ).length;
  if (unresolvedThreads > 0) {
    return {
      reason: 'UNRESOLVED_THREADS',
      summary: `${unresolvedThreads} unresolved review thread(s).`,
      nextAction:
        'Resolve threads via github_finish_fix_round or github_resolve_threads.',
    };
  }
  if (ci.isPending) {
    return {
      reason: 'CI_PENDING',
      summary: 'CI checks are still running.',
      nextAction: 'Wait for CI to complete.',
    };
  }
  if (pr.isInMergeQueue) {
    return {
      reason: 'IN_MERGE_QUEUE',
      summary: 'PR is in the merge queue.',
      nextAction: 'Wait for merge queue to process.',
    };
  }
  if (!pr.reviewDecision || pr.reviewDecision === 'REVIEW_REQUIRED') {
    return {
      reason: 'AWAITING_REVIEW',
      summary: 'Awaiting reviewer approval.',
      nextAction:
        'Request review via github_request_review or wait for bot review.',
    };
  }
  return {
    reason: 'READY',
    summary: 'PR appears ready to merge.',
    nextAction: 'Enable auto-merge or merge manually.',
  };
}

/**
 * Semantic one-shot for CI failure investigation.
 *
 * Replaces the 4-5 call chain: github_view_pr → github_get_check_runs →
 * github_pr_why_blocked → ci_find_session → ci_get_logs. Returns a compact
 * markdown report: PR state, CI summary, failing job list with extracted
 * error context, and a recommended next action.
 *
 * Note: log extraction requires ci_find_session + ci_get_logs (LS-7798).
 * This tool returns job names and check-run output summaries; fetch full logs
 * separately for detailed error lines.
 */
export async function diagnose(params: DiagnoseParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    const result = await githubGraphQL<PRStateResponse>(PR_STATE_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      number: params.prNumber,
    });

    const pr = result.data.repository.pullRequest;
    if (!pr) {
      return {
        isError: true,
        content: [{ type: 'text', text: `PR #${params.prNumber} not found.` }],
      };
    }

    // Evaluate CI using the same logic as pr-why-blocked (required checks, dedup)
    let ci = {
      hasFailures: false,
      isPending: false,
      failingNames: [] as string[],
    };
    let failingRuns: CheckRun[] = [];
    let ciEvalWarning: string | undefined;
    try {
      const ciEval = await evaluatePRChecks(
        repo.owner,
        repo.name,
        pr.headRefOid,
        pr.baseRefName,
      );
      ci = {
        hasFailures: ciEval.failing.length > 0,
        isPending: ciEval.pending.length > 0,
        failingNames: ciEval.failing,
      };
      if (ci.hasFailures) {
        failingRuns = await fetchFailingCheckRuns(
          repo.owner,
          repo.name,
          pr.headRefOid,
        );
      }
    } catch (ciErr: unknown) {
      // CI evaluation failure is non-fatal — surface PR state without CI verdict
      ciEvalWarning = ciErr instanceof Error ? ciErr.message : String(ciErr);
    }

    // A `reviews(first: 20)` first page only covers the earliest reviews —
    // fetch the rest so a reviewer's true latest state (which may be beyond
    // page 1 on a heavily-reviewed PR) is never missed by the dedup below.
    if (pr.reviews.pageInfo.hasNextPage) {
      pr.reviews.nodes = await fetchAllReviews(
        repo.owner,
        repo.name,
        params.prNumber,
        pr.reviews,
      );
    }

    const {
      reason,
      summary: blockSummary,
      nextAction,
    } = deriveReason(pr, ci, failingRuns);
    const labels = pr.labels.nodes.map((l) => l.name);
    const unresolvedThreads = pr.reviewThreads.nodes.filter(
      (t) => !t.isResolved,
    ).length;

    const report = [
      `## PR #${pr.number}: ${pr.title}`,
      `**URL:** ${pr.url}`,
      `**State:** ${pr.state}${pr.isDraft ? ' (draft)' : ''}`,
      `**Mergeable:** ${pr.mergeable}`,
      `**Labels:** ${labels.length > 0 ? labels.join(', ') : 'none'}`,
      `**Unresolved threads:** ${unresolvedThreads} / ${pr.reviewThreads.totalCount}`,
      '',
      `### Why blocked: ${reason}`,
      blockSummary,
      '',
      `**Next action:** ${nextAction}`,
    ];

    if (ciEvalWarning) {
      report.push('', `> **Warning:** CI evaluation failed: ${ciEvalWarning}`);
    }

    if (failingRuns.length > 0) {
      report.push('', '### Failing CI jobs');
      for (const run of failingRuns) {
        report.push(`- **${run.name}** (${run.conclusion ?? run.status})`);
        if (run.output.summary) {
          const truncated = run.output.summary.slice(0, 400);
          report.push(`  > ${truncated.replace(/\n/g, '\n  > ')}`);
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            prNumber: pr.number,
            title: pr.title,
            url: pr.url,
            reason,
            summary: blockSummary,
            nextAction,
            labels,
            unresolvedThreads,
            failingJobs: failingRuns.map((r) => ({
              name: r.name,
              conclusion: r.conclusion,
              outputSummary: r.output.summary?.slice(0, 400) ?? null,
              url: r.html_url,
            })),
            ...(ciEvalWarning ? { ciEvalWarning } : {}),
            report: report.join('\n'),
          }),
        },
      ],
    };
  } catch (e) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `github_pr_diagnose failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }
}
