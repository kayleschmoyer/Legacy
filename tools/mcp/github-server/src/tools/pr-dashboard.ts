import { runGhJson, runGraphQL, getRepoOwnerName } from '../gh.js';
import { summarizeCIStatus, deduplicateChecks } from '../types.js';
import type { ToolResult } from '../types.js';

interface PRDashboardParams {
  state?: string;
  author?: string;
  label?: string;
  limit?: number;
}

interface PRListItem {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: Array<{ name: string }>;
  isDraft: boolean;
  mergeable: string;
  reviewDecision: string | null;
  statusCheckRollup: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }> | null;
}

interface ReviewThreadCounts {
  [prNumber: number]: {
    total: number;
    unresolved: number;
    truncated: boolean;
  };
}

interface GraphQLBatchReviewThreadsResponse {
  data: {
    repository: {
      [alias: string]: {
        reviewThreads: {
          totalCount: number;
          pageInfo: { hasNextPage: boolean };
          nodes: Array<{ isResolved: boolean }>;
        };
      };
    };
  };
}

const PR_FIELDS = [
  'number',
  'title',
  'state',
  'headRefName',
  'baseRefName',
  'author',
  'createdAt',
  'updatedAt',
  'url',
  'labels',
  'isDraft',
  'mergeable',
  'reviewDecision',
  'statusCheckRollup',
];

function buildBatchReviewThreadsQuery(prNumbers: number[]): string {
  const fragments = prNumbers.map(
    (num) => `
    pr_${num}: pullRequest(number: ${num}) {
      reviewThreads(first: 100) {
        totalCount
        pageInfo { hasNextPage }
        nodes { isResolved }
      }
    }`,
  );

  return `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    ${fragments.join('\n')}
  }
}`;
}

async function fetchReviewThreadCounts(
  owner: string,
  repo: string,
  prNumbers: number[],
): Promise<ReviewThreadCounts> {
  const counts: ReviewThreadCounts = {};

  // Batch PRs into groups for a single GraphQL query per batch
  const BATCH_SIZE = 30;
  for (let i = 0; i < prNumbers.length; i += BATCH_SIZE) {
    const batch = prNumbers.slice(i, i + BATCH_SIZE);
    try {
      const query = buildBatchReviewThreadsQuery(batch);
      const result = await runGraphQL<GraphQLBatchReviewThreadsResponse>(
        query,
        {
          owner,
          repo,
        },
      );
      for (const num of batch) {
        const alias = `pr_${num}`;
        const threadData = result.data.repository[alias];
        if (threadData) {
          const threads = threadData.reviewThreads;
          const unresolved = threads.nodes.filter((t) => !t.isResolved).length;
          counts[num] = {
            total: threads.totalCount,
            unresolved,
            truncated: threads.pageInfo.hasNextPage,
          };
        } else {
          counts[num] = { total: -1, unresolved: -1, truncated: false };
        }
      }
    } catch {
      for (const num of batch) {
        counts[num] = { total: -1, unresolved: -1, truncated: false };
      }
    }
  }

  return counts;
}

export async function prDashboard(
  params: PRDashboardParams,
): Promise<ToolResult> {
  try {
    // 1. List PRs
    const args = [
      'pr',
      'list',
      '--json',
      PR_FIELDS.join(','),
      '--limit',
      String(params.limit ?? 30),
    ];

    if (params.state) {
      args.push('--state', params.state);
    }
    if (params.author) {
      args.push('--author', params.author);
    }
    if (params.label) {
      args.push('--label', params.label);
    }

    const prs = await runGhJson<PRListItem[]>(args);

    if (prs.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: {
                  total: 0,
                  conflicting: 0,
                  ciFailing: 0,
                  ciPending: 0,
                  ciPassing: 0,
                  withUnresolvedThreads: 0,
                  drafts: 0,
                  approved: 0,
                  withStaleChecks: 0,
                },
                recommendBatchStatus: false,
                prs: [],
                message: 'No PRs found matching filters.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // 2. Fetch review thread counts via GraphQL
    const repo = await getRepoOwnerName();
    const prNumbers = prs.map((pr) => pr.number);
    const threadCounts = await fetchReviewThreadCounts(
      repo.owner,
      repo.name,
      prNumbers,
    );

    // 3. Build dashboard rows
    const rows = prs.map((pr) => {
      const dedupedChecks = pr.statusCheckRollup
        ? deduplicateChecks(pr.statusCheckRollup)
        : null;
      const ci = summarizeCIStatus(dedupedChecks);
      const hadStaleChecks =
        pr.statusCheckRollup != null &&
        dedupedChecks != null &&
        pr.statusCheckRollup.length > dedupedChecks.length;
      const threads = threadCounts[pr.number] ?? {
        total: -1,
        unresolved: -1,
        truncated: false,
      };

      return {
        number: pr.number,
        title: pr.title,
        branch: pr.headRefName,
        base: pr.baseRefName,
        author: pr.author.login,
        isDraft: pr.isDraft,
        mergeable: pr.mergeable,
        ciStatus: ci,
        hadStaleChecks,
        reviewDecision: pr.reviewDecision,
        unresolvedThreads: threads.unresolved,
        totalThreads: threads.total,
        threadCountTruncated: threads.truncated,
        labels: pr.labels.map((l) => l.name),
        updatedAt: pr.updatedAt,
        url: pr.url,
      };
    });

    // 4. Compute summary counts
    const summary = {
      total: rows.length,
      conflicting: rows.filter((r) => r.mergeable === 'CONFLICTING').length,
      ciFailing: rows.filter((r) => r.ciStatus === 'fail').length,
      ciPending: rows.filter((r) => r.ciStatus === 'pending').length,
      ciPassing: rows.filter((r) => r.ciStatus === 'pass').length,
      withUnresolvedThreads: rows.filter((r) => r.unresolvedThreads > 0).length,
      drafts: rows.filter((r) => r.isDraft).length,
      approved: rows.filter((r) => r.reviewDecision === 'APPROVED').length,
      withStaleChecks: rows.filter((r) => r.hadStaleChecks).length,
    };

    const recommendBatchStatus = summary.withStaleChecks > 0;
    const stalePRNumbers = rows
      .filter((r) => r.hadStaleChecks)
      .map((r) => r.number);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              summary,
              recommendBatchStatus,
              ...(recommendBatchStatus
                ? {
                    note: `${summary.withStaleChecks} PR(s) had stale CI checks that were deduplicated (${stalePRNumbers.map((n) => `#${n}`).join(', ')}). Use github_pr_batch_status for job-level CI details on these PRs.`,
                  }
                : {}),
              prs: rows,
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
          text: `Failed to build PR dashboard: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
