import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import {
  CI_FAILURE_CONCLUSIONS,
  summarizeCIStatus,
  SUPERSEDED_CONCLUSIONS,
} from '../types.js';
import type { ToolResult } from '../types.js';
import {
  dedupeLatestByName,
  normalizeChecks,
  type StatusCheckNode,
} from '../utils/github-checks.js';

interface PRBatchStatusParams {
  numbers: number[];
  compact?: boolean;
}

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
        oid: string;
        statusCheckRollup: {
          contexts: {
            nodes: Array<StatusCheckNode | null>;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
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
    nodes: Array<{ id: string; isResolved: boolean; isOutdated: boolean }>;
  };
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
            oid
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  ... on CheckRun { __typename name status conclusion startedAt completedAt }
                  ... on StatusContext { __typename context state createdAt }
                }
                pageInfo { hasNextPage endCursor }
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
        nodes { id isResolved isOutdated }
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

const CONTEXTS_PAGE_QUERY = `
query($owner: String!, $repo: String!, $oid: GitObjectID!, $after: String) {
  repository(owner: $owner, name: $repo) {
    object(oid: $oid) {
      ... on Commit {
        statusCheckRollup {
          contexts(first: 100, after: $after) {
            nodes {
              ... on CheckRun { __typename name status conclusion startedAt completedAt }
              ... on StatusContext { __typename context state createdAt }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  }
}`;

interface ContextsPageResponse {
  repository: {
    object: {
      statusCheckRollup: {
        contexts: {
          nodes: Array<StatusCheckNode | null>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    } | null;
  } | null;
}

/**
 * `statusCheckRollup.contexts(first: 100)` silently truncates PRs with more
 * than 100 checks. Drain remaining pages via the commit oid so ciSummary and
 * failedJobs never miss a check (LS-8829 review, Cycle 2).
 */
async function fetchRemainingContexts(
  owner: string,
  repo: string,
  oid: string,
  after: string | null,
): Promise<Array<StatusCheckNode | null>> {
  const extra: Array<StatusCheckNode | null> = [];
  let cursor = after;
  // Safety cap: 10 additional pages (up to 1000 more checks) to bound worst-case latency.
  for (let page = 0; page < 10 && cursor; page++) {
    const result = await githubGraphQL<ContextsPageResponse>(
      CONTEXTS_PAGE_QUERY,
      { owner, repo, oid, after: cursor },
    );
    const contexts = result.data.repository?.object?.statusCheckRollup
      ?.contexts ?? {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    };
    extra.push(...contexts.nodes);
    cursor = contexts.pageInfo.hasNextPage ? contexts.pageInfo.endCursor : null;
  }
  return extra;
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
    const rows = await Promise.all(
      allPRs.map(async (pr) => {
        const commitNode = pr.commits.nodes[0];
        const rollup = commitNode?.commit.statusCheckRollup;
        let checkNodes: (StatusCheckNode | null)[] =
          rollup?.contexts.nodes ?? [];
        if (rollup?.contexts.pageInfo.hasNextPage) {
          checkNodes = checkNodes.concat(
            await fetchRemainingContexts(
              repo.owner,
              repo.name,
              commitNode.commit.oid,
              rollup.contexts.pageInfo.endCursor,
            ),
          );
        }
        const ciJobs = dedupeLatestByName(normalizeChecks(checkNodes)).map(
          ({ startedAt: _startedAt, ...ciJob }) => ciJob,
        );
        const ciSummary = summarizeCIStatus(ciJobs);

        const totalThreads = pr.reviewThreads.totalCount;
        const unresolvedThreadNodes = pr.reviewThreads.nodes.filter(
          (t) => !t.isResolved && !t.isOutdated,
        );
        const unresolvedThreads = unresolvedThreadNodes.length;
        const unresolvedThreadIds = unresolvedThreadNodes.map((t) => t.id);
        const threadCountTruncated = pr.reviewThreads.pageInfo.hasNextPage;

        // Compact mode: omit verbose fields (ciJobs, reviews, labels, url)
        if (params.compact) {
          const failedJobs = ciJobs
            .filter(
              (j) => j.conclusion && CI_FAILURE_CONCLUSIONS.has(j.conclusion),
            )
            .map((j) => j.name);
          // Superseded jobs stay visible rather than being silently dropped, so a
          // caller that cares (e.g. diagnosing a merge-queue churn loop) can still
          // see them without re-calling the full form (LS-10116). SKIPPED is
          // excluded: it was never counted as failing, and this repo's pipeline
          // skips enough jobs that listing them would bloat the hot-path payload
          // the compact form exists to keep cheap.
          const cancelledJobs = ciJobs
            .filter(
              (j) => j.conclusion && SUPERSEDED_CONCLUSIONS.has(j.conclusion),
            )
            .map((j) => j.name);

          return {
            number: pr.number,
            branch: pr.headRefName,
            mergeable: pr.mergeable,
            ciSummary,
            ...(failedJobs.length > 0 ? { failedJobs } : {}),
            ...(cancelledJobs.length > 0 ? { cancelledJobs } : {}),
            unresolvedThreads,
            ...(unresolvedThreadIds.length > 0 ? { unresolvedThreadIds } : {}),
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
          ...(unresolvedThreadIds.length > 0 ? { unresolvedThreadIds } : {}),
          totalThreads,
          threadCountTruncated,
          labels: pr.labels.nodes.map((l) => l.name),
          updatedAt: pr.updatedAt,
          url: pr.url,
        };
      }),
    );

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({ count: rows.length, prs: rows }),
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
