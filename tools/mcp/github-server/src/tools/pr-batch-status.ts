import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import { FAILED_CONCLUSIONS, summarizeCIStatus } from '../types.js';
import type { ToolResult } from '../types.js';

interface PRBatchStatusParams {
  numbers: number[];
  compact?: boolean;
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

interface PRBatchNode {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string } | null;
  isDraft: boolean;
  mergeable: string;
  reviewDecision: string | null;
  updatedAt: string;
  url: string;
  labels: { nodes: Array<{ name: string }> };
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
    nodes: Array<{
      author: { login: string } | null;
      state: string;
      submittedAt: string;
    }>;
  };
  reviewThreads: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean };
    nodes: Array<{ isResolved: boolean; isOutdated: boolean }>;
  };
}

function normalizeChecks(
  nodes: (StatusCheckNode | null)[],
): Array<{ name: string; status: string; conclusion: string | null }> {
  return nodes.flatMap((node) => {
    if (node == null) return [];
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

function buildBatchPRQuery(numbers: number[]): string {
  const fragments = numbers.map(
    (num) => `
    pr_${num}: pullRequest(number: ${num}) {
      number
      title
      state
      headRefName
      baseRefName
      author { login }
      isDraft
      mergeable
      reviewDecision
      updatedAt
      url
      labels(first: 20) { nodes { name } }
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
      reviews(first: 50) {
        nodes {
          author { login }
          state
          submittedAt
        }
      }
      reviewThreads(first: 100) {
        totalCount
        pageInfo { hasNextPage }
        nodes { isResolved isOutdated }
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

interface BatchGraphQLResponse {
  repository: {
    [alias: string]: PRBatchNode;
  } | null;
}

export async function prBatchStatus(
  params: PRBatchStatusParams,
): Promise<ToolResult> {
  const uniquePrNumbers = [...new Set(params.numbers)];

  try {
    const repo = await getRepoOwnerName();

    // Fetch all PR data in batched GraphQL queries (30 per batch)
    const BATCH_SIZE = 30;
    const allPRs: PRBatchNode[] = [];

    for (let i = 0; i < uniquePrNumbers.length; i += BATCH_SIZE) {
      const batch = uniquePrNumbers.slice(i, i + BATCH_SIZE);
      const query = buildBatchPRQuery(batch);
      const result = await githubGraphQL<BatchGraphQLResponse>(query, {
        owner: repo.owner,
        repo: repo.name,
      });

      for (const num of batch) {
        const pr = result.data.repository?.[`pr_${num}`];
        if (pr) allPRs.push(pr);
      }
    }

    // Build rows
    const rows = allPRs.map((pr) => {
      const commitNode = pr.commits.nodes[0];
      const checkNodes = (
        commitNode?.commit.statusCheckRollup?.contexts.nodes ?? []
      ).filter((n): n is StatusCheckNode => n != null);
      const ciJobs = normalizeChecks(checkNodes);
      const ciSummary = summarizeCIStatus(ciJobs);

      const totalThreads = pr.reviewThreads.totalCount;
      const unresolvedThreads = pr.reviewThreads.nodes.filter(
        (t) => !t.isResolved && !t.isOutdated,
      ).length;
      const threadCountTruncated = pr.reviewThreads.pageInfo.hasNextPage;

      // Compact mode: omit verbose fields (ciJobs, reviews, labels, url)
      if (params.compact) {
        const failedJobs = ciJobs
          .filter((j) => j.conclusion && FAILED_CONCLUSIONS.has(j.conclusion))
          .map((j) => j.name);

        return {
          number: pr.number,
          branch: pr.headRefName,
          mergeable: pr.mergeable,
          ciSummary,
          ...(failedJobs.length > 0 ? { failedJobs } : {}),
          unresolvedThreads,
          ...(threadCountTruncated ? { threadCountTruncated: true } : {}),
        };
      }

      const reviews = pr.reviews.nodes.map((r) => ({
        author: r.author?.login ?? 'unknown',
        state: r.state,
        submittedAt: r.submittedAt,
      }));

      return {
        number: pr.number,
        title: pr.title,
        branch: pr.headRefName,
        base: pr.baseRefName,
        author: pr.author?.login ?? 'unknown',
        isDraft: pr.isDraft,
        mergeable: pr.mergeable,
        ciSummary,
        ciJobs,
        reviewDecision: pr.reviewDecision,
        reviews,
        unresolvedThreads,
        totalThreads,
        threadCountTruncated,
        labels: pr.labels.nodes.map((l) => l.name),
        updatedAt: pr.updatedAt,
        url: pr.url,
      };
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ count: rows.length, prs: rows }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch batch PR status: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
