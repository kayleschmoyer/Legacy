import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import { deduplicateChecks, summarizeCIStatus } from '../types.js';
import type { CICheck, ToolResult } from '../types.js';

interface PRDashboardParams {
  state?: string;
  author?: string;
  label?: string;
  limit?: number;
  excludeDrafts?: boolean;
}

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

interface PRNode {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string } | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: { nodes: Array<{ name: string }> };
  isDraft: boolean;
  mergeable: string;
  reviewDecision: string | null;
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: {
          contexts: {
            nodes: StatusCheckNode[];
          };
        } | null;
      };
    }>;
  };
}

interface ReviewThreadCounts {
  [prNumber: number]: {
    total: number;
    unresolved: number;
    truncated: boolean;
  };
}

interface BatchReviewThreadsResponse {
  repository: {
    [alias: string]: {
      reviewThreads: {
        totalCount: number;
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{ isResolved: boolean }>;
      };
    };
  };
}

// GraphQL state enum values
function mapState(state: string): string {
  switch (state) {
    case 'open':
      return 'OPEN';
    case 'closed':
      return 'CLOSED';
    case 'merged':
      return 'MERGED';
    case 'all':
      return 'OPEN,CLOSED,MERGED';
    default:
      return 'OPEN';
  }
}

function normalizeChecks(nodes: StatusCheckNode[]): CICheck[] {
  return nodes.map((node) => {
    if (node.__typename === 'CheckRun') {
      return {
        name: node.name,
        status: node.status,
        conclusion: node.conclusion,
      };
    }
    return {
      name: node.context,
      status: node.state,
      conclusion:
        node.state === 'SUCCESS'
          ? 'SUCCESS'
          : node.state === 'PENDING'
            ? null
            : node.state,
    };
  });
}

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

  const BATCH_SIZE = 30;
  for (let i = 0; i < prNumbers.length; i += BATCH_SIZE) {
    const batch = prNumbers.slice(i, i + BATCH_SIZE);
    try {
      const query = buildBatchReviewThreadsQuery(batch);
      const result = await githubGraphQL<BatchReviewThreadsResponse>(query, {
        owner,
        repo,
      });
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
    const repo = await getRepoOwnerName();
    const limit = params.limit ?? 30;
    const statesStr = mapState(params.state ?? 'open');

    // Build query with optional filters
    const sanitizedLabel = params.label?.replace(/"/g, '\\"') ?? '';
    const labelFilter = sanitizedLabel ? `, labels: ["${sanitizedLabel}"]` : '';

    // If author filter is needed, use search query instead
    let prNodes: PRNode[];

    if (params.author) {
      const queryParts = [
        `repo:${repo.owner}/${repo.name}`,
        'is:pr',
        `author:${params.author}`,
      ];
      const state = params.state ?? 'open';
      if (state !== 'all') {
        queryParts.push(`is:${state}`);
      }
      if (params.label) {
        queryParts.push(`label:"${params.label.replace(/"/g, '\\"')}"`);
      }

      const searchQuery = `
query($query: String!, $first: Int!) {
  search(query: $query, type: ISSUE, first: $first) {
    nodes {
      ... on PullRequest {
        number
        title
        state
        headRefName
        baseRefName
        author { login }
        createdAt
        updatedAt
        url
        labels(first: 20) { nodes { name } }
        isDraft
        mergeable
        reviewDecision
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
      }
    }
  }
}`;
      const result = await githubGraphQL<{
        search: { nodes: PRNode[] };
      }>(searchQuery, {
        query: queryParts.join(' '),
        first: limit,
      });
      prNodes = result.data.search.nodes.filter((n) => n.number != null);
    } else {
      const query = `
query($owner: String!, $repo: String!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $first, states: [${statesStr}]${labelFilter}, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        state
        headRefName
        baseRefName
        author { login }
        createdAt
        updatedAt
        url
        labels(first: 20) { nodes { name } }
        isDraft
        mergeable
        reviewDecision
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
      }
    }
  }
}`;
      const result = await githubGraphQL<{
        repository: { pullRequests: { nodes: PRNode[] } };
      }>(query, {
        owner: repo.owner,
        repo: repo.name,
        first: limit,
      });
      prNodes = result.data.repository.pullRequests.nodes;
    }

    // Filter out draft PRs when excludeDrafts is enabled (default: true)
    const excludeDrafts = params.excludeDrafts ?? true;
    const draftsExcluded = excludeDrafts
      ? prNodes.filter((pr) => pr.isDraft).length
      : 0;
    if (excludeDrafts) {
      prNodes = prNodes.filter((pr) => !pr.isDraft);
    }

    if (prNodes.length === 0) {
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
                ...(draftsExcluded > 0 ? { draftsExcluded } : {}),
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

    // Fetch review thread counts
    const prNumbers = prNodes.map((pr) => pr.number);
    const threadCounts = await fetchReviewThreadCounts(
      repo.owner,
      repo.name,
      prNumbers,
    );

    // Build dashboard rows
    const rows = prNodes.map((pr) => {
      const commitNode = pr.commits.nodes[0];
      const checkNodes =
        commitNode?.commit.statusCheckRollup?.contexts.nodes ?? [];
      const rawChecks = normalizeChecks(checkNodes);
      const checks = deduplicateChecks(rawChecks);
      const hadStaleChecks = checks.length < rawChecks.length;
      const ci = summarizeCIStatus(checks);
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
        author: pr.author?.login ?? 'unknown',
        isDraft: pr.isDraft,
        mergeable: pr.mergeable,
        ciStatus: ci,
        hadStaleChecks,
        reviewDecision: pr.reviewDecision,
        unresolvedThreads: threads.unresolved,
        totalThreads: threads.total,
        threadCountTruncated: threads.truncated,
        labels: pr.labels.nodes.map((l) => l.name),
        updatedAt: pr.updatedAt,
        url: pr.url,
      };
    });

    // Compute summary counts
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
              ...(draftsExcluded > 0 ? { draftsExcluded } : {}),
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
